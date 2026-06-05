/**
 * components/ErrorBoundary.tsx
 * React Error Boundary for graceful error handling
 */

import React, { ReactNode, ReactElement } from 'react';

interface Props {
  children: ReactNode;
  fallback?: (error: Error, retry: () => void) => ReactElement;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
    };
  }

  override componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log error details
    console.error('Error caught by boundary:', error);
    console.error('Error info:', errorInfo);
  }

  handleRetry = () => {
    this.setState({
      hasError: false,
      error: null,
    });
  };

  override render() {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.handleRetry);
      }

      return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
            <h1 className="text-2xl font-bold text-red-600 dark:text-red-400 mb-4">
              Something Went Wrong
            </h1>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              An unexpected error occurred. Please try again.
            </p>
            <details className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 rounded border border-red-200 dark:border-red-800">
              <summary className="cursor-pointer font-semibold text-red-800 dark:text-red-200 text-sm">
                Error Details
              </summary>
              <pre className="mt-2 text-xs text-red-700 dark:text-red-300 overflow-auto max-h-32">
                {this.state.error.toString()}
              </pre>
            </details>
            <button
              onClick={this.handleRetry}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition font-medium"
            >
              Try Again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
