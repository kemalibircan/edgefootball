import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      error: error || null,
    };
  }

  componentDidCatch(error, errorInfo) {
    if (typeof this.props.onError === "function") {
      this.props.onError(error, errorInfo);
    }
    console.error("[ErrorBoundary] render failed", error, errorInfo);
  }

  componentDidUpdate(prevProps) {
    if (!this.state.hasError) return;
    if (prevProps.resetKey === this.props.resetKey) return;
    this.setState({
      hasError: false,
      error: null,
    });
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    if (typeof this.props.fallback === "function") {
      return this.props.fallback({ error: this.state.error });
    }

    if (this.props.fallback !== undefined) {
      return this.props.fallback;
    }

    return null;
  }
}
