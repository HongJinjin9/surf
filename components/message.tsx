"use client";

import React from "react";
import { ChatMessage as ChatMessageType } from "@/types/chat";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { cva, VariantProps } from "class-variance-authority";

const messageVariants = cva("", {
  variants: {
    role: {
      user: "bg-accent/20 text-accent-fg border-accent-300",
      assistant: "bg-bg-200 dark:bg-bg-200 text-fg border-border-200",
      system: "bg-bg-100 dark:bg-bg-300 text-fg-300 border-border italic",
      action: "bg-bg-100 dark:bg-bg-300 text-fg-300 border-border italic",
    },
  },
  defaultVariants: {
    role: "system",
  },
});

interface MessageProps extends VariantProps<typeof messageVariants> {
  role: ChatMessageType["role"];
  content: string;
  className?: string;
}

/**
 * Message component for chat messages
 */
export function Message({ role, content, className }: MessageProps) {
  const isUser = role === "user";
  const isAssistant = role === "assistant";
  const isSystem = role === "system";
  const isAction = role === "action";

  const roleLabel = isUser
    ? "You"
    : isAssistant
    ? "Assistant"
    : isAction
    ? "Action"
    : "System";

  return (
    <div
      className={cn(
        "flex",
        isUser ? "justify-end" : "justify-start",
        className
      )}
    >
      <Card
        className={cn(
          "max-w-[85%] rounded-lg overflow-hidden border",
          messageVariants({ role })
        )}
        variant="slate"
      >
        <CardContent className="p-3">
          <div className="text-xs mb-1 font-mono uppercase tracking-wider opacity-75">
            {roleLabel}
          </div>
          <div className="whitespace-pre-wrap break-words font-sans text-sm tracking-wide">
            {content}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
