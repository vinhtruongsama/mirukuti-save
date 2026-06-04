const EMOJI_SPLIT_REGEX = /(\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?)*)/gu;
const EMOJI_TOKEN_REGEX = /^\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?)*$/u;

export function renderTextWithEmoji(text: string) {
  return text.split(EMOJI_SPLIT_REGEX).map((part, index) => {
    if (!part) return null;

    if (EMOJI_TOKEN_REGEX.test(part)) {
      return (
        <span
          key={`emoji-${index}`}
          className="inline-block align-[-0.08em] leading-none activity-emoji"
          style={{ fontSize: 'calc(1em + 4px)' }}
        >
          {part}
        </span>
      );
    }

    return <span key={`text-${index}`}>{part}</span>;
  });
}
