/**
 * 表情按钮：检测 VRM 是否支持 BlendShape 表情，若支持则显示按钮和下拉菜单
 */

import { useState, useRef, useEffect } from 'react';
import type { EmotionType } from '@/protocol/types';
import { useAppStore } from '@/app/state';

export interface ExpressionButtonsProps {
  onGetAvailableExpressions: () => string[];
}

export function ExpressionButtons({ onGetAvailableExpressions }: ExpressionButtonsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [availableExpressions, setAvailableExpressions] = useState<string[]>([]);
  const menuRef = useRef<HTMLDivElement>(null);
  const { setEmotion, current } = useAppStore();

  useEffect(() => {
    const expressions = onGetAvailableExpressions();
    setAvailableExpressions(expressions);
  }, [onGetAvailableExpressions]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (availableExpressions.length === 0) return null;

  const handleSelectEmotion = (emotion: string) => {
    console.log('[ExpressionButtons] Selecting emotion:', emotion);
    setEmotion(emotion as EmotionType);
    setIsOpen(false);
  };

  return (
    <div className="expression-buttons" style={{ marginTop: '0.5rem' }}>
      <div className="dropdown" ref={menuRef}>
        <button
          type="button"
          className="clip-buttons__btn"
          onClick={() => setIsOpen(!isOpen)}
          style={{ minWidth: '100px' }}
        >
          表情 ▾
        </button>
        {isOpen && (
          <div className="dropdown__menu dropdown__menu--left">
            {availableExpressions.map((name) => (
              <button
                key={name}
                type="button"
                className="dropdown__btn"
                style={current.emotion === name ? { background: '#334155' } : {}}
                onClick={() => handleSelectEmotion(name)}
              >
                {name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
