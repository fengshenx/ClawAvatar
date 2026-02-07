/**
 * Bubble Component
 *
 * Speech bubble for messages
 */

interface BubbleProps {
  message: string;
}

export function Bubble({ message }: BubbleProps) {
  return (
    <div className="bubble">
      {message}
    </div>
  );
}
