import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Workbench render error', error, info.componentStack);
  }
  render() {
    if (this.state.failed)
      return (
        <main style={{ padding: 48 }}>
          <h1>工作台暂时无法显示</h1>
          <p>请刷新重试。浏览器中的原始数据未被清除。</p>
          <button onClick={() => window.location.reload()}>刷新页面</button>
        </main>
      );
    return this.props.children;
  }
}
