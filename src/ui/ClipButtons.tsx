/**
 * 模型内置动作按钮：仅当 GLB/VRM 带有 gltf.animations 时展示
 * 点击对应按钮播放该动画片段
 */

export interface ClipButtonsProps {
  clipNames: string[];
  onPlayClip: (name: string) => void;
}

export function ClipButtons({ clipNames, onPlayClip }: ClipButtonsProps) {
  if (clipNames.length === 0) return null;

  return (
    <div className="clip-buttons">
      <div className="clip-buttons__label">模型动作</div>
      <div className="clip-buttons__row">
        {clipNames.map((name, index) => (
          <button
            key={`${index}-${name}`}
            type="button"
            className="clip-buttons__btn"
            onClick={() => {
              console.log('[UI] Button clicked:', name);
              onPlayClip(name);
            }}
          >
            {name}
          </button>
        ))}
      </div>
    </div>
  );
}
