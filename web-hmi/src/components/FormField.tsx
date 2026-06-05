/**
 * components/FormField.tsx
 * Reusable form field component with validation
 */

import React from 'react';

export interface FormFieldProps {
  label: string;
  name: string;
  type?: 'text' | 'number' | 'email' | 'url' | 'password';
  placeholder?: string;
  value: string | number;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onBlur: (e: React.FocusEvent<HTMLInputElement>) => void;
  error?: string;
  helperText?: string;
  disabled?: boolean;
  required?: boolean;
  min?: number;
  max?: number;
  step?: number;
}

export const FormField: React.FC<FormFieldProps> = ({
  label,
  name,
  type = 'text',
  placeholder,
  value,
  onChange,
  onBlur,
  error,
  helperText,
  disabled,
  required,
  min,
  max,
  step,
}) => {
  const hasError = !!error;

  return (
    <div className="space-y-2">
      <label htmlFor={name} className="block text-sm font-medium text-gray-700 dark:text-gray-300">
        {label}
        {required && <span className="text-red-600 dark:text-red-400 ml-1">*</span>}
      </label>

      <input
        id={name}
        name={name}
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        disabled={disabled}
        min={min}
        max={max}
        step={step}
        className={`w-full px-4 py-2 border rounded-md transition focus:outline-none focus:ring-2 ${
          hasError
            ? 'border-red-300 dark:border-red-600 bg-red-50 dark:bg-red-900/20 focus:ring-red-500 dark:focus:ring-red-400'
            : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 focus:ring-blue-500 dark:focus:ring-blue-400'
        } text-gray-900 dark:text-white disabled:opacity-50 disabled:cursor-not-allowed`}
      />

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400 flex items-center">
          <span className="mr-1">⚠️</span>
          {error}
        </p>
      )}

      {helperText && !error && (
        <p className="text-xs text-gray-500 dark:text-gray-400">{helperText}</p>
      )}
    </div>
  );
};

export interface FormSelectProps {
  label: string;
  name: string;
  options: { value: string | number; label: string }[];
  value: string | number;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  onBlur: (e: React.FocusEvent<HTMLSelectElement>) => void;
  error?: string;
  helperText?: string;
  disabled?: boolean;
  required?: boolean;
}

export const FormSelect: React.FC<FormSelectProps> = ({
  label,
  name,
  options,
  value,
  onChange,
  onBlur,
  error,
  helperText,
  disabled,
  required,
}) => {
  const hasError = !!error;

  return (
    <div className="space-y-2">
      <label htmlFor={name} className="block text-sm font-medium text-gray-700 dark:text-gray-300">
        {label}
        {required && <span className="text-red-600 dark:text-red-400 ml-1">*</span>}
      </label>

      <select
        id={name}
        name={name}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        disabled={disabled}
        className={`w-full px-4 py-2 border rounded-md transition focus:outline-none focus:ring-2 ${
          hasError
            ? 'border-red-300 dark:border-red-600 bg-red-50 dark:bg-red-900/20 focus:ring-red-500 dark:focus:ring-red-400'
            : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 focus:ring-blue-500 dark:focus:ring-blue-400'
        } text-gray-900 dark:text-white disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        <option value="">Select an option</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400 flex items-center">
          <span className="mr-1">⚠️</span>
          {error}
        </p>
      )}

      {helperText && !error && (
        <p className="text-xs text-gray-500 dark:text-gray-400">{helperText}</p>
      )}
    </div>
  );
};

export interface FormTextareaProps {
  label: string;
  name: string;
  placeholder?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onBlur: (e: React.FocusEvent<HTMLTextAreaElement>) => void;
  error?: string;
  helperText?: string;
  disabled?: boolean;
  required?: boolean;
  rows?: number;
}

export const FormTextarea: React.FC<FormTextareaProps> = ({
  label,
  name,
  placeholder,
  value,
  onChange,
  onBlur,
  error,
  helperText,
  disabled,
  required,
  rows = 3,
}) => {
  const hasError = !!error;

  return (
    <div className="space-y-2">
      <label htmlFor={name} className="block text-sm font-medium text-gray-700 dark:text-gray-300">
        {label}
        {required && <span className="text-red-600 dark:text-red-400 ml-1">*</span>}
      </label>

      <textarea
        id={name}
        name={name}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        disabled={disabled}
        rows={rows}
        className={`w-full px-4 py-2 border rounded-md transition focus:outline-none focus:ring-2 resize-none ${
          hasError
            ? 'border-red-300 dark:border-red-600 bg-red-50 dark:bg-red-900/20 focus:ring-red-500 dark:focus:ring-red-400'
            : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 focus:ring-blue-500 dark:focus:ring-blue-400'
        } text-gray-900 dark:text-white disabled:opacity-50 disabled:cursor-not-allowed`}
      />

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400 flex items-center">
          <span className="mr-1">⚠️</span>
          {error}
        </p>
      )}

      {helperText && !error && (
        <p className="text-xs text-gray-500 dark:text-gray-400">{helperText}</p>
      )}
    </div>
  );
};
