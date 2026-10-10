import { useEffect, useState } from 'react';
import { Pause, Play, RotateCcw, Coffee, Focus } from 'lucide-react';
import { useAppStore, repository } from '../../data/store';
import { newTimer } from '../../data/defaults';
import { settleTimer } from '../../data/timer';
import { useUi } from '../../shared/ui-context';
import styles from '../features.module.css';

export function TimerController() {
  const status = useAppStore((state) => state.snapshot.timer.status);
  const deadline = useAppStore((state) => state.snapshot.timer.deadline);
  const { notify } = useUi();
  useEffect(() => {
    if (status !== 'running' || deadline === null) return;
    let busy = false;
    let failed = false;
    const check = async () => {
      if (Date.now() < deadline || busy || failed) return;
      busy = true;
      let settled: 'focus' | 'break' | null = null;
      try {
        await repository.update((draft) => {
          settled = settleTimer(draft, Date.now());
        });
        if (settled === 'focus')
          notify('专注完成，已记录 25 分钟自习。休息已准备好，点击开始即可。');
        else if (settled === 'break') notify('休息结束，下一轮专注已准备好。');
      } catch (reason) {
        failed = true;
        notify(reason instanceof Error ? reason.message : '计时记录保存失败，请重试', true);
      } finally {
        busy = false;
      }
    };
    void check();
    const interval = window.setInterval(() => void check(), 1000);
    const resume = () => {
      failed = false;
      void check();
    };
    window.addEventListener('focus', resume);
    document.addEventListener('visibilitychange', resume);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', resume);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [status, deadline, notify]);
  return null;
}

export function TimerCard() {
  const { timer, data } = useAppStore((state) => state.snapshot);
  const { run, confirm } = useUi();
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (timer.status !== 'running') return;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [timer.status]);
  const remaining =
    timer.status === 'running' && timer.deadline !== null
      ? Math.min(timer.remainingMs, Math.max(0, timer.deadline - now))
      : timer.remainingMs;
  const seconds = Math.ceil(remaining / 1000);
  const total = (timer.phase === 'focus' ? 25 : 5) * 60 * 1000;
  const circumference = 2 * Math.PI * 78;
  const subjects = data.subjects.filter(
    (subject) => subject.active || subject.id === timer.subjectId,
  );
  const subjectId = timer.subjectId ?? subjects.find((subject) => subject.active)?.id ?? '';
  const toggle = () =>
    void run(() =>
      repository.update((draft) => {
        const time = Date.now();
        if (settleTimer(draft, time)) return;
        const state = draft.timer;
        if (state.status === 'running') {
          state.remainingMs = Math.max(0, (state.deadline ?? time) - time);
          state.deadline = null;
          state.status = 'paused';
        } else {
          const subject = draft.data.subjects.find(
            (entry) => entry.id === (state.subjectId ?? subjectId),
          );
          if (
            state.phase === 'focus' &&
            (!subject || (state.status === 'ready' && !subject.active))
          )
            throw new Error('请选择可用科目，或到设置添加一个科目');
          state.subjectId = subject?.id ?? null;
          state.sessionId =
            state.phase === 'focus' ? (state.sessionId ?? crypto.randomUUID()) : null;
          state.deadline = time + state.remainingMs;
          state.status = 'running';
        }
      }),
    );
  const reset = () => {
    const action = async () => {
      await repository.update((draft) => {
        settleTimer(draft, Date.now());
        draft.timer = { ...newTimer(), subjectId: draft.timer.subjectId };
      });
    };
    if (timer.status !== 'ready')
      confirm({
        title: '重置番茄钟',
        description: '结束当前阶段并回到 25 分钟专注。尚未完成的专注不会自动记入自习记录。',
        label: '确认重置',
        action,
      });
    else void run(action);
  };
  return (
    <section className={styles.timerCard} aria-label="番茄钟">
      <div className={styles.timerHeading}>
        <span>
          {timer.phase === 'focus' ? <Focus size={17} /> : <Coffee size={17} />}
          {timer.phase === 'focus' ? '专注时间' : '休息时间'}
        </span>
        <span className={styles.timerBadge}>25 / 5</span>
      </div>
      <div className={styles.timerDial}>
        <svg viewBox="0 0 180 180" aria-hidden="true">
          <circle
            cx="90"
            cy="90"
            r="78"
            fill="none"
            stroke="rgba(255,255,255,.09)"
            strokeWidth="4"
          />
          <circle
            cx="90"
            cy="90"
            r="78"
            fill="none"
            stroke={timer.phase === 'focus' ? '#adc4ff' : '#b0dac8'}
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - remaining / total)}
            transform="rotate(-90 90 90)"
          />
        </svg>
        <div>
          <strong data-testid="timer-time">
            {String(Math.floor(seconds / 60)).padStart(2, '0')}:
            {String(seconds % 60).padStart(2, '0')}
          </strong>
          <span>
            {timer.status === 'running'
              ? '保持节奏，专注当下'
              : timer.status === 'paused'
                ? '已暂停，随时继续'
                : '准备好了，就开始吧'}
          </span>
        </div>
      </div>
      <label className={styles.timerSubject}>
        自习科目
        <select
          aria-label="计时科目"
          value={subjectId}
          disabled={timer.status !== 'ready'}
          onChange={(event) =>
            void run(() =>
              repository.update((draft) => {
                draft.timer.subjectId = event.target.value || null;
              }),
            )
          }
        >
          <option value="">请选择科目</option>
          {subjects.map((subject) => (
            <option key={subject.id} value={subject.id} disabled={!subject.active}>
              {subject.name}
              {!subject.active ? '（已停用）' : ''}
            </option>
          ))}
        </select>
      </label>
      <div className={styles.timerControls}>
        <button onClick={toggle} disabled={timer.phase === 'focus' && !subjectId}>
          <span>
            {timer.status === 'running' ? <Pause size={16} /> : <Play size={16} />}
            {timer.status === 'running'
              ? '暂停'
              : timer.status === 'paused'
                ? '继续'
                : timer.phase === 'focus'
                  ? '开始专注'
                  : '开始休息'}
          </span>
        </button>
        <button onClick={reset} aria-label="重置番茄钟">
          <RotateCcw size={16} />
        </button>
      </div>
      <p>专注完成自动记时 · 休息后手动开始下一轮</p>
    </section>
  );
}
