import { format, parseISO } from "date-fns";
import type { Message } from "@/types/database";
import { FailureBadge } from "./failure-badge";

interface MessageBubbleProps {
  message: Message;
  isBot: boolean;
}

export function MessageBubble({ message, isBot }: MessageBubbleProps) {
  const alignment = isBot ? "justify-end" : "justify-start";
  const bubbleBg = isBot
    ? "bg-blue-50 rounded-2xl rounded-br-sm"
    : "bg-gray-100 rounded-2xl rounded-bl-sm";

  return (
    <div className={`flex ${alignment} mb-3`}>
      <div className="max-w-[75%]">
        <div className={`px-4 py-2.5 ${bubbleBg}`}>
          <p className="text-sm text-gray-900 whitespace-pre-wrap">
            {message.content}
          </p>
        </div>

        <div
          className={`flex items-center gap-2 mt-1 ${isBot ? "justify-end" : "justify-start"}`}
        >
          <span className="text-xs text-gray-400">
            {message.sent_at
              ? format(parseISO(message.sent_at), "HH:mm")
              : ""}
          </span>
          {isBot && (
            <FailureBadge
              score={message.failure_score}
              reason={message.failure_reason}
            />
          )}
        </div>
      </div>
    </div>
  );
}
