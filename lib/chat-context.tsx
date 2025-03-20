"use client";

import React, {
  createContext,
  useContext,
  useState,
  useRef,
  useCallback,
} from "react";
import {
  ChatMessage,
  ChatState,
  ParsedSSEEvent,
  SendMessageOptions,
  AnyMessagePart,
  ActionChatMessage,
  UserChatMessage,
  AssistantChatMessage,
  SystemChatMessage,
} from "@/types/chat";
import { ComputerModel, SSEEventType } from "@/types/api";

/**
 * Chat context interface
 */
interface ChatContextType extends ChatState {
  sendMessage: (options: SendMessageOptions) => Promise<void>;
  stopGeneration: () => void;
  clearMessages: () => void;
  setInput: (input: string) => void;
  input: string;
  handleSubmit: (e: React.FormEvent) => string | undefined;
  onSandboxCreated: (
    callback: (sandboxId: string, vncUrl: string) => void
  ) => void;
  model: ComputerModel;
  setModel: (model: ComputerModel) => void;
}

/**
 * Chat context
 */
const ChatContext = createContext<ChatContextType | undefined>(undefined);

/**
 * Chat context provider props
 */
interface ChatProviderProps {
  children: React.ReactNode;
}

/**
 * Chat context provider
 */
export function ChatProvider({ children }: ChatProviderProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const abortControllerRef = useRef<AbortController | null>(null);
  const onSandboxCreatedRef = useRef<
    ((sandboxId: string, vncUrl: string) => void) | undefined
  >(undefined);
  const [model, setModel] = useState<"base" | "advanced">("base");

  /**
   * Parse an SSE event from the server
   * Handles various SSE format edge cases
   */
  const parseSSEEvent = (data: string): ParsedSSEEvent | null => {
    try {
      // Handle empty data
      if (!data || data.trim() === "") {
        return null;
      }

      // For debugging in development
      if (process.env.NODE_ENV === "development") {
        console.debug(
          "Parsing SSE event:",
          data.substring(0, 100) + (data.length > 100 ? "..." : "")
        );
      }

      // Check if the data starts with "data: " prefix (SSE format)
      if (data.startsWith("data: ")) {
        // Extract the JSON part (remove "data: " prefix)
        const jsonStr = data.substring(6).trim();

        // Handle empty JSON
        if (!jsonStr) {
          return null;
        }

        return JSON.parse(jsonStr);
      }

      // Handle case where multiple SSE events are in one chunk
      // This could happen if the newlines aren't properly handled
      const match = data.match(/data: ({.*})/);
      if (match && match[1]) {
        return JSON.parse(match[1]);
      }

      // If no prefix, try parsing directly (fallback)
      return JSON.parse(data);
    } catch (e) {
      console.error(
        "Error parsing SSE event:",
        e,
        "Data:",
        data.substring(0, 200) + (data.length > 200 ? "..." : "")
      );
      return null;
    }
  };

  /**
   * Send a message to the server
   */
  const sendMessage = async ({
    content,
    sandboxId,
    environment,
    resolution,
  }: SendMessageOptions) => {
    if (isLoading) return;

    setIsLoading(true);
    setError(null);

    // Add user message to chat
    const userMessage: ChatMessage = {
      role: "user",
      content,
      id: Date.now().toString(),
    };

    setMessages((prev) => [...prev, userMessage]);

    // Create abort controller for the fetch request
    abortControllerRef.current = new AbortController();

    try {
      // Prepare messages for API request
      const apiMessages = messages
        .concat(userMessage)
        .filter((msg) => msg.role !== "action") // Filter out action messages
        .map((msg) => {
          // Type assertion to access content property
          const typedMsg = msg as
            | UserChatMessage
            | AssistantChatMessage
            | SystemChatMessage;
          return {
            role: typedMsg.role,
            content: typedMsg.content,
          };
        });

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: apiMessages,
          sandboxId,
          environment,
          resolution,
          model,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("Response body is null");

      // Create a temporary assistant message that will be updated
      const assistantMessageId = (Date.now() + 1).toString();
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Thinking...",
          id: assistantMessageId,
          parts: [],
          isLoading: true,
          timestamp: Date.now(),
        },
      ]);

      // Process the stream
      const decoder = new TextDecoder();
      let assistantMessage = "";
      let parts: AnyMessagePart[] = [];
      let buffer = ""; // Buffer to accumulate partial chunks

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          // Process any remaining data in the buffer before breaking
          if (buffer.trim()) {
            const parsedEvent = parseSSEEvent(buffer);
            if (parsedEvent) {
              // Handle the final event
              if (parsedEvent.type === SSEEventType.DONE) {
                parts = parsedEvent.content;
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMessageId
                      ? {
                          ...msg,
                          content: assistantMessage || "Task completed",
                          parts,
                          isLoading: false,
                        }
                      : msg
                  )
                );
                setIsLoading(false);
              }
            }
          }
          break;
        }

        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk; // Add new chunk to buffer

        // Split by double newlines which indicate complete SSE events
        const events = buffer.split("\n\n");

        // The last element might be incomplete, so keep it in the buffer
        buffer = events.pop() || "";

        // Process complete events
        for (const event of events) {
          if (!event.trim()) continue; // Skip empty events

          const parsedEvent = parseSSEEvent(event);
          if (!parsedEvent) continue;

          switch (parsedEvent.type) {
            case SSEEventType.UPDATE:
              // Update the assistant message with the latest content
              parts = parsedEvent.content;

              // Extract text content from reasoning items
              const reasoningItems = parsedEvent.content.filter(
                (item: AnyMessagePart) =>
                  item.type === "text" && "content" in item
              );

              if (reasoningItems.length > 0) {
                assistantMessage = reasoningItems
                  .map((item: any) => item.content)
                  .join("\n");
              }

              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === assistantMessageId
                    ? {
                        ...msg,
                        content: assistantMessage || "Thinking...",
                        parts,
                        isLoading: true,
                      }
                    : msg
                )
              );
              break;

            case SSEEventType.ACTION:
              if (parsedEvent.action && parsedEvent.callId) {
                // Add an action message
                const actionMessage: ActionChatMessage = {
                  role: "action",
                  id: `action-${Date.now()}`,
                  actionType: parsedEvent.action.type,
                  action: parsedEvent.action,
                  callId: parsedEvent.callId,
                  status: "pending",
                };

                setMessages((prev) => [...prev, actionMessage]);
              }
              break;

            case SSEEventType.REASONING:
              if (typeof parsedEvent.content === "string") {
                assistantMessage = parsedEvent.content;
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMessageId
                      ? {
                          ...msg,
                          content: assistantMessage,
                          isLoading: true,
                        }
                      : msg
                  )
                );
              }
              break;

            case SSEEventType.DONE:
              parts = parsedEvent.content;
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === assistantMessageId
                    ? {
                        ...msg,
                        content: assistantMessage || "Task completed",
                        parts,
                        isLoading: false,
                      }
                    : msg
                )
              );
              setIsLoading(false);
              break;

            case SSEEventType.ERROR:
              setError(parsedEvent.content);
              setIsLoading(false);
              break;

            case SSEEventType.SANDBOX_CREATED:
              if (
                parsedEvent.sandboxId &&
                parsedEvent.vncUrl &&
                onSandboxCreatedRef.current
              ) {
                onSandboxCreatedRef.current(
                  parsedEvent.sandboxId,
                  parsedEvent.vncUrl
                );
              }
              break;

            case SSEEventType.ACTION_COMPLETED:
              if (parsedEvent.callId) {
                // Update the action message status to completed
                setMessages((prev) =>
                  prev.map((msg) => {
                    if (
                      msg.role === "action" &&
                      "callId" in msg &&
                      msg.callId === parsedEvent.callId
                    ) {
                      return {
                        ...msg,
                        status: "completed",
                      };
                    }
                    return msg;
                  })
                );
              }
              break;
          }
        }
      }
    } catch (error) {
      console.error("Error sending message:", error);
      setError(error instanceof Error ? error.message : "An error occurred");
      setIsLoading(false);
    }
  };

  /**
   * Stop message generation
   */
  const stopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      try {
        // Abort with a reason to avoid the "signal is aborted without reason" error
        abortControllerRef.current.abort(
          new DOMException("Generation stopped by user", "AbortError")
        );
        setIsLoading(false);

        // Update the loading message to indicate it was stopped
        setMessages((prev) =>
          prev.map((msg) => {
            if ("isLoading" in msg && msg.isLoading) {
              return {
                ...msg,
                content: msg.content + " (stopped)",
                isLoading: false,
              };
            }
            return msg;
          })
        );
      } catch (error) {
        console.error("Error stopping generation:", error);
        // Still set loading to false even if there's an error
        setIsLoading(false);
      }
    }
  }, []);

  /**
   * Clear all messages
   */
  const clearMessages = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  /**
   * Handle form submission
   */
  const handleSubmit = useCallback(
    (e: React.FormEvent): string | undefined => {
      e.preventDefault();
      if (!input.trim()) return;

      const content = input.trim();
      setInput("");
      return content;
    },
    [input]
  );

  const value = {
    messages,
    isLoading,
    error,
    input,
    setInput,
    sendMessage,
    stopGeneration,
    clearMessages,
    handleSubmit,
    model,
    setModel,
    onSandboxCreated: (
      callback: (sandboxId: string, vncUrl: string) => void
    ) => {
      onSandboxCreatedRef.current = callback;
    },
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

/**
 * Hook to use the chat context
 */
export function useChat() {
  const context = useContext(ChatContext);
  if (context === undefined) {
    throw new Error("useChat must be used within a ChatProvider");
  }
  return context;
}
