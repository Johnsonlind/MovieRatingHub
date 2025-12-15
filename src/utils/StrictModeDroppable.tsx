// ==========================================
// 严格模式拖拽容器组件 - 解决React严格模式下的拖拽问题
// ==========================================
import { useEffect, useState } from 'react';
import { Droppable, DroppableProps } from '@hello-pangea/dnd';

export const StrictModeDroppable = ({ children, ...props }: DroppableProps) => {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const animation = requestAnimationFrame(() => setEnabled(true));
    return () => {
      cancelAnimationFrame(animation);
      setEnabled(false);
    };
  }, []);

  if (!enabled) {
    return null;
  }

  return <Droppable {...props}>{children}</Droppable>;
};