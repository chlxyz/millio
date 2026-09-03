import { Component, type ReactNode } from "react"

// ponytail: without this, any render throw unmounts the whole root = blank white page
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null }

  static getDerivedStateFromError(e: unknown) {
    return { error: e instanceof Error ? e.message : "Something went wrong" }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="wrap" style={{ padding: "60px 20px", textAlign: "center" }}>
          <h2 style={{ fontWeight: 400 }}>Something went wrong</h2>
          <p style={{ color: "var(--muted)", fontSize: 13 }}>{this.state.error}</p>
          <button className="btn" style={{ marginTop: 12 }} onClick={() => window.location.reload()}>Reload</button>
        </div>
      )
    }
    return this.props.children
  }
}
