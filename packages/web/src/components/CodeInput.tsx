import React, { useRef, useState, useEffect, KeyboardEvent } from 'react';

interface CodeInputProps {
  length?: number;
  onComplete: (code: string) => void;
  className?: string;
}

export const CodeInput: React.FC<CodeInputProps> = ({
  length = 6,
  onComplete,
  className = '',
}) => {
  const [code, setCode] = useState<string[]>(Array(length).fill(''));
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    // Focus first input on mount
    inputRefs.current[0]?.focus();
  }, []);

  const handleChange = (index: number, value: string) => {
    // Only allow alphanumeric characters
    const char = value.toUpperCase().replace(/[^A-Z0-9]/g, '');

    if (char.length === 0) return;

    const newCode = [...code];
    newCode[index] = char[0];
    setCode(newCode);

    // Move to next input
    if (index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }

    // Check if code is complete
    if (newCode.every((c) => c !== '') && index === length - 1) {
      onComplete(newCode.join(''));
    }
  };

  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      const newCode = [...code];

      if (code[index] !== '') {
        // Clear current input
        newCode[index] = '';
        setCode(newCode);
      } else if (index > 0) {
        // Move to previous input and clear it
        newCode[index - 1] = '';
        setCode(newCode);
        inputRefs.current[index - 1]?.focus();
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').toUpperCase().replace(/[^A-Z0-9]/g, '');

    const newCode = [...code];
    for (let i = 0; i < Math.min(pastedData.length, length); i++) {
      newCode[i] = pastedData[i];
    }
    setCode(newCode);

    // Focus last filled input or last input
    const lastIndex = Math.min(pastedData.length, length - 1);
    inputRefs.current[lastIndex]?.focus();

    // Check if complete
    if (newCode.every((c) => c !== '')) {
      onComplete(newCode.join(''));
    }
  };

  return (
    <div className={`flex gap-2 sm:gap-3 justify-center ${className}`} dir="ltr">
      {Array.from({ length }).map((_, index) => (
        <input
          key={index}
          ref={(el) => (inputRefs.current[index] = el)}
          type="text"
          maxLength={1}
          value={code[index]}
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onPaste={index === 0 ? handlePaste : undefined}
          className="w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 text-center text-lg sm:text-xl md:text-2xl font-bold glass rounded-xl sm:rounded-2xl focus:outline-none focus:ring-2 focus:ring-secondary-main transition-all"
        />
      ))}
    </div>
  );
};
