"use client";

import React from "react";
import { Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ExamplePromptProps {
  text: string;
  onClick: () => void;
  disabled?: boolean;
}

/**
 * Individual example prompt button
 */
export function ExamplePrompt({ text, onClick, disabled }: ExamplePromptProps) {
  return (
    <Button
      onClick={onClick}
      variant="outline"
      size="lg"
      className="text-left whitespace-normal text-sm sm:text-base h-auto py-2 px-3 sm:px-4"
      disabled={disabled}
    >
      {text}
    </Button>
  );
}

interface ExamplePromptsProps {
  onPromptClick: (prompt: string) => void;
  prompts?: Array<{ text: string; prompt: string }>;
  disabled?: boolean;
  className?: string;
}

/**
 * Example prompts container with default prompts
 */
export function ExamplePrompts({
  onPromptClick,
  prompts = [
    {
      text: "Check SF weather",
      prompt: "What's the weather like in San Francisco?",
    },
    {
      text: "Find cat pictures",
      prompt: "Search for cute cat pictures on the internet",
    },
    {
      text: "OpenAI news",
      prompt: "Show me the latest news about OpenAI",
    },
  ],
  disabled = false,
  className,
}: ExamplePromptsProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 sm:gap-4 mx-auto my-4 sm:my-6 w-full max-w-[600px] px-4",
        className
      )}
    >
      <div className="flex items-center gap-2 text-accent">
        <Terminal className="w-4 h-4" />
        <span className="text-sm font-mono">Try these examples</span>
      </div>
      <div className="flex flex-wrap gap-2 justify-center w-full px-2 sm:px-0 pb-2 overflow-x-auto scrollbar-thin scrollbar-thumb-[#EBEBEB] dark:scrollbar-thumb-[#333333] scrollbar-track-transparent">
        {prompts.map((item, index) => (
          <ExamplePrompt
            key={index}
            text={item.text}
            onClick={() => onPromptClick(item.prompt)}
            disabled={disabled}
          />
        ))}
      </div>
    </div>
  );
}
