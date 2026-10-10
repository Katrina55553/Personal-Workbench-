import { expect, it } from 'vitest';
import { createInitialSnapshot, BREAK_MS, FOCUS_MS } from './defaults';
import { settleTimer } from './timer';
import { localDate } from '../shared/date';

function runningFocus(deadline: number) {
  const snapshot = createInitialSnapshot();
  snapshot.timer = {
    phase: 'focus',
    status: 'running',
    remainingMs: FOCUS_MS,
    deadline,
    sessionId: crypto.randomUUID(),
    subjectId: snapshot.data.subjects[0]!.id,
  };
  return snapshot;
}
it('专注完成只记一次，准备休息并等用户开始', () => {
  const snapshot = runningFocus(10000);
  expect(settleTimer(snapshot, 9999)).toBeNull();
  expect(settleTimer(snapshot, 10000)).toBe('focus');
  expect(settleTimer(snapshot, 11000)).toBeNull();
  expect(snapshot.data.studyRecords).toHaveLength(1);
  expect(snapshot.data.studyRecords[0]?.minutes).toBe(25);
  expect(snapshot.timer).toMatchObject({
    phase: 'break',
    status: 'ready',
    remainingMs: BREAK_MS,
    deadline: null,
  });
});
it('离线多天只补结算已启动的一段，日期使用真实截止日', () => {
  const deadline = new Date(2026, 9, 10, 0, 5).getTime();
  const snapshot = runningFocus(deadline);
  settleTimer(snapshot, deadline + 7 * 86400000);
  expect(snapshot.data.studyRecords).toHaveLength(1);
  expect(snapshot.data.studyRecords[0]?.date).toBe(localDate(new Date(deadline)));
  expect(snapshot.timer.status).toBe('ready');
});
it('重复回调会话不会生成重复记录，休息不会增加自习', () => {
  const snapshot = runningFocus(10000);
  const previous = { ...snapshot.timer };
  settleTimer(snapshot, 10000);
  snapshot.timer = previous;
  settleTimer(snapshot, 10000);
  expect(snapshot.data.studyRecords).toHaveLength(1);
  snapshot.timer.status = 'running';
  snapshot.timer.deadline = 20000;
  expect(settleTimer(snapshot, 20000)).toBe('break');
  expect(snapshot.data.studyRecords).toHaveLength(1);
  expect(snapshot.timer).toMatchObject({ phase: 'focus', status: 'ready', remainingMs: FOCUS_MS });
});
it('暂停和未到时的会话不结算', () => {
  const snapshot = runningFocus(10000);
  snapshot.timer.status = 'paused';
  snapshot.timer.deadline = null;
  expect(settleTimer(snapshot, 20000)).toBeNull();
  expect(snapshot.data.studyRecords).toEqual([]);
});
