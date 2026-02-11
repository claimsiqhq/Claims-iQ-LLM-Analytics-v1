import React, { Component, ReactNode, ErrorInfo } from 'react';
import { AlertTriangle, Reload } from 'iconoir-react';
import { Button } from './ui/Button';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * Error Boundary component that catches React render errors
 * Displays a branded error UI and provides a recovery mechanism
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log the error to console for debugging
    console.error('ErrorBoundary caught an error:', error, errorInfo);

    // Update state with error details
    this.setState({
      error,
      errorInfo,
    });
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-brand-purple/10 via-white to-surface-purple-light/50">
          <div className="max-w-md w-full mx-4">
            {/* Error Card */}
            <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-8">
              {/* Error Icon */}
              <div className="flex justify-center mb-6">
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
                  <AlertTriangle
                    width={32}
                    height={32}
                    className="text-red-600"
                  />
                </div>
              </div>

              {/* Error Message */}
              <h1 className="text-2xl font-bold text-gray-900 text-center mb-2">
                Something Went Wrong
              </h1>
              <p className="text-center text-gray-600 mb-6">
                We encountered an unexpected error. Please try again.
              </p>

              {/* Error Details (Development Only) */}
              {process.env.NODE_ENV === 'development' && this.state.error && (
                <details className="mb-6 text-xs">
                  <summary className="cursor-pointer font-semibold text-gray-700 mb-2 select-none hover:text-gray-900">
                    Error Details
                  </summary>
                  <div className="bg-gray-50 rounded-lg p-3 border border-gray-200 font-mono text-gray-700 overflow-auto max-h-40">
                    <p className="font-bold mb-2">Message:</p>
                    <p className="mb-3 break-words">{this.state.error.toString()}</p>

                    {this.state.errorInfo && (
                      <>
                        <p className="font-bold mb-2">Stack Trace:</p>
                        <p className="text-red-700 break-words">
                          {this.state.errorInfo.componentStack}
                        </p>
                      </>
                    )}
                  </div>
                </details>
              )}

              {/* Action Button */}
              <div className="flex flex-col gap-3">
                <Button
                  onClick={this.handleReset}
                  className="w-full bg-brand-purple hover:bg-brand-deep-purple text-white font-medium py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  <Reload width={18} height={18} />
                  Try Again
                </Button>

                <button
                  onClick={() => window.location.href = '/'}
                  className="w-full px-4 py-3 text-brand-purple border-2 border-brand-purple rounded-lg font-medium hover:bg-surface-purple-light transition-colors"
                >
                  Go to Home
                </button>
              </div>

              {/* Support Note */}
              <p className="text-center text-xs text-gray-500 mt-6">
                If the problem persists, please contact support.
              </p>
            </div>

            {/* Background Decoration */}
            <div className="absolute inset-0 -z-10 overflow-hidden pointer-events-none">
              <div className="absolute top-20 left-10 w-32 h-32 bg-brand-purple/5 rounded-full blur-3xl" />
              <div className="absolute bottom-20 right-10 w-40 h-40 bg-brand-gold/5 rounded-full blur-3xl" />
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
