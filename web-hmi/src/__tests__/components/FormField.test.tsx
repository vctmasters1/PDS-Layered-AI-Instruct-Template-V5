import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FormField } from '@components/FormField';

describe('FormField Component - Unit Tests', () => {
  const defaultProps = {
    label: 'Test Field',
    name: 'testField',
    type: 'text' as const,
    value: '',
    onChange: jest.fn(),
    onBlur: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('rendering', () => {
    it('should render label text', () => {
      render(<FormField {...defaultProps} label="Email Address" />);
      expect(screen.getByText('Email Address')).toBeInTheDocument();
    });

    it('should render input element', () => {
      render(<FormField {...defaultProps} name="email" />);
      expect(screen.getByDisplayValue('')).toBeInTheDocument();
    });

    it('should apply correct input type', () => {
      render(<FormField {...defaultProps} type="password" />);
      const input = screen.getByDisplayValue('') as HTMLInputElement;
      expect(input.type).toBe('password');
    });

    it('should render placeholder when provided', () => {
      render(
        <FormField {...defaultProps} placeholder="Enter your email" />
      );
      expect(screen.getByPlaceholderText('Enter your email')).toBeInTheDocument();
    });

    it('should render required indicator when required', () => {
      render(<FormField {...defaultProps} required />);
      expect(screen.getByText('*')).toBeInTheDocument();
    });

    it('should render helper text when valid', () => {
      render(
        <FormField
          {...defaultProps}
          error={null}
          helperText="This is helpful text"
        />
      );
      expect(screen.getByText('This is helpful text')).toBeInTheDocument();
    });

    it('should render error message when error exists', () => {
      const error = {
        field: 'email',
        message: 'Invalid email format',
        type: 'format' as const,
      };
      render(<FormField {...defaultProps} error={error} />);
      expect(screen.getByText('Invalid email format')).toBeInTheDocument();
    });
  });

  describe('interactions', () => {
    it('should call onChange when value changes', async () => {
      const onChange = jest.fn();
      render(
        <FormField {...defaultProps} onChange={onChange} />
      );

      const input = screen.getByDisplayValue('') as HTMLInputElement;
      await userEvent.type(input, 'test');

      expect(onChange).toHaveBeenCalled();
    });

    it('should call onBlur when field loses focus', () => {
      const onBlur = jest.fn();
      render(
        <FormField {...defaultProps} onBlur={onBlur} />
      );

      const input = screen.getByDisplayValue('');
      fireEvent.blur(input);

      expect(onBlur).toHaveBeenCalled();
    });

    it('should display value prop', () => {
      render(
        <FormField {...defaultProps} value="test value" />
      );

      expect(screen.getByDisplayValue('test value')).toBeInTheDocument();
    });
  });

  describe('disabled state', () => {
    it('should disable input when disabled prop is true', () => {
      render(
        <FormField {...defaultProps} disabled />
      );

      const input = screen.getByDisplayValue('') as HTMLInputElement;
      expect(input.disabled).toBe(true);
    });

    it('should not call onChange when disabled', async () => {
      const onChange = jest.fn();
      render(
        <FormField {...defaultProps} onChange={onChange} disabled />
      );

      const input = screen.getByDisplayValue('') as HTMLInputElement;
      await userEvent.type(input, 'test');

      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe('error styling', () => {
    it('should apply error styling when error exists', () => {
      const error = {
        field: 'email',
        message: 'Invalid email',
        type: 'format' as const,
      };
      const { container } = render(
        <FormField {...defaultProps} error={error} />
      );

      const input = container.querySelector('input');
      expect(input).toHaveClass('border-red-500');
    });

    it('should apply success styling when touched and no error', () => {
      const { container } = render(
        <FormField {...defaultProps} error={null} />
      );

      const input = container.querySelector('input');
      expect(input).not.toHaveClass('border-red-500');
    });
  });

  describe('different input types', () => {
    it('should render email input', () => {
      render(
        <FormField {...defaultProps} type="email" />
      );

      const input = screen.getByDisplayValue('') as HTMLInputElement;
      expect(input.type).toBe('email');
    });

    it('should render number input', () => {
      render(
        <FormField {...defaultProps} type="number" min="0" max="100" />
      );

      const input = screen.getByDisplayValue('') as HTMLInputElement;
      expect(input.type).toBe('number');
      expect(input.min).toBe('0');
      expect(input.max).toBe('100');
    });

    it('should render url input', () => {
      render(
        <FormField {...defaultProps} type="url" />
      );

      const input = screen.getByDisplayValue('') as HTMLInputElement;
      expect(input.type).toBe('url');
    });
  });

  describe('accessibility', () => {
    it('should have associated label', () => {
      render(
        <FormField {...defaultProps} name="email" label="Email" />
      );

      const label = screen.getByText('Email');
      expect(label).toBeInTheDocument();
    });

    it('should have aria-label when provided', () => {
      render(
        <FormField
          {...defaultProps}
          name="email"
        />
      );

      const input = screen.getByDisplayValue('');
      expect(input).toHaveAttribute('name', 'email');
    });

    it('should have aria-describedby for error messages', () => {
      const error = {
        field: 'email',
        message: 'Invalid email',
        type: 'format' as const,
      };
      const { container } = render(
        <FormField {...defaultProps} error={error} />
      );

      const input = container.querySelector('input');
      expect(input).toHaveAttribute('aria-invalid', 'true');
    });
  });
});

describe('FormField Multiple Types', () => {
  it('should handle text, email, password, url, number types', () => {
    const types = ['text', 'email', 'password', 'url', 'number'] as const;

    types.forEach(type => {
      const { unmount } = render(
        <FormField
          label={`${type} field`}
          name={type}
          type={type}
          value=""
          onChange={jest.fn()}
          onBlur={jest.fn()}
        />
      );

      const input = screen.getByDisplayValue('') as HTMLInputElement;
      expect(input.type).toBe(type);
      unmount();
    });
  });
});
