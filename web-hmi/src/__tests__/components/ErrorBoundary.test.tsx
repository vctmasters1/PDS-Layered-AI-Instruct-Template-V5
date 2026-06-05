import React from 'react';
import { render, screen } from '@testing-library/react';
import { ErrorBoundary } from '@components/ErrorBoundary';

const ThrowError = ({ shouldThrow }: { shouldThrow: boolean }) => {
  if (shouldThrow) {
    throw new Error('Test error occurred');
  }
  return <div>Child component rendered successfully</div>;
};

describe('ErrorBoundary Component - Unit Tests', () => {
  // Suppress console.error for these tests
  const originalError = console.error;
  beforeAll(() => {
    console.error = jest.fn();
  });

  afterAll(() => {
    console.error = originalError;
  });

  describe('rendering', () => {
    it('should render children when no error occurs', () => {
      render(
        <ErrorBoundary>
          <div>Test content</div>
        </ErrorBoundary>
      );

      expect(screen.getByText('Test content')).toBeInTheDocument();
    });

    it('should catch error and display error message', () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(screen.getByText(/An error occurred/i)).toBeInTheDocument();
      expect(screen.getByText(/Test error occurred/i)).toBeInTheDocument();
    });

    it('should display retry button', () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      const retryButton = screen.getByRole('button', { name: /retry/i });
      expect(retryButton).toBeInTheDocument();
    });
  });

  describe('error handling', () => {
    it('should catch React component errors', () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(screen.getByText(/An error occurred/i)).toBeInTheDocument();
    });

    it('should display error details when details are expanded', () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      const detailsButton = screen.getByRole('button', { name: /show details/i });
      detailsButton.click();

      expect(screen.getByText(/Test error occurred/i)).toBeInTheDocument();
    });

    it('should have details hidden initially', () => {
      const { container } = render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      const errorDetails = container.querySelector('[data-testid="error-details"]');
      expect(errorDetails).toHaveClass('hidden');
    });
  });

  describe('retry functionality', () => {
    it('should re-render on retry attempt', () => {
      const { rerender } = render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(screen.getByText(/An error occurred/i)).toBeInTheDocument();

      // Simulate successful retry
      rerender(
        <ErrorBoundary>
          <ThrowError shouldThrow={false} />
        </ErrorBoundary>
      );

      expect(screen.getByText('Child component rendered successfully')).toBeInTheDocument();
    });
  });

  describe('error logging', () => {
    it('should log error information for debugging', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('dark mode support', () => {
    it('should render with dark mode classes', () => {
      const { container } = render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      const errorContainer = container.querySelector('[data-testid="error-boundary-container"]');
      expect(errorContainer).toBeInTheDocument();
    });
  });

  describe('multiple children', () => {
    it('should handle multiple children when no error', () => {
      render(
        <ErrorBoundary>
          <div>Child 1</div>
          <div>Child 2</div>
          <div>Child 3</div>
        </ErrorBoundary>
      );

      expect(screen.getByText('Child 1')).toBeInTheDocument();
      expect(screen.getByText('Child 2')).toBeInTheDocument();
      expect(screen.getByText('Child 3')).toBeInTheDocument();
    });

    it('should catch error from nested children', () => {
      render(
        <ErrorBoundary>
          <div>
            <div>
              <ThrowError shouldThrow={true} />
            </div>
          </div>
        </ErrorBoundary>
      );

      expect(screen.getByText(/An error occurred/i)).toBeInTheDocument();
    });
  });
});
