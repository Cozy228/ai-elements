import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '@/components/conversation';
import { Message, MessageContent } from '@/components/message';
import {
  PromptInput,
  PromptInputButton,
  PromptInputModelSelect,
  PromptInputModelSelectContent,
  PromptInputModelSelectItem,
  PromptInputModelSelectTrigger,
  PromptInputModelSelectValue,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputToolbar,
  PromptInputTools,
} from '@/components/prompt-input';
import { useState, useCallback } from 'react';
import { useChat } from '@ai-sdk/react';
import { createRai } from '@/provider/rai-provider';
import { Response } from '@/components/response';
import { GlobeIcon } from 'lucide-react';
import {
  Source,
  Sources,
  SourcesContent,
  SourcesTrigger,
} from '@/components/source';
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from '@/components/reasoning';
import { Loader } from '@/components/loader';

const models = [
  {
    name: 'GPT 4o',
    value: 'openai/gpt-4o',
  },
  {
    name: 'Deepseek R1',
    value: 'deepseek/deepseek-r1',
  },
  {
    name: 'RAI Chat Model',
    value: 'rai/gpt-4o',
  },
];
const rai = createRai();

interface ResponseMetrics {
  id: string;
  tokenUsage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
  responseTime: number;
  model: string;
}

interface TokenUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

interface OnFinishData {
  message: {
    id: string;
    createdAt?: Date;
  };
  finishReason?: string;
  usage?: TokenUsage;
  requestBody?: {
    startTime?: number;
    model?: string;
  };
}

const ChatBotDemo = () => {
  const [input, setInput] = useState('');
  const [model, setModel] = useState<string>(models[2].value); // Default to RAI model
  const [webSearch, setWebSearch] = useState(false);
  const [responseMetrics, setResponseMetrics] = useState<ResponseMetrics[]>([]);
  
  const onFinish = useCallback((data: OnFinishData) => {
    const { message, finishReason, usage, requestBody } = data;
    const endTime = Date.now();
    const startTime = requestBody?.startTime || endTime;
    const responseTime = endTime - startTime;
    
    // AI SDK v5 token usage format
    const tokenUsage = usage ? {
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      totalTokens: usage.totalTokens,
    } : undefined;
    
    const metrics: ResponseMetrics = {
      id: message.id,
      tokenUsage,
      responseTime,
      model: requestBody?.model || model,
    };
    
    setResponseMetrics(prev => [...prev, metrics]);
    
    console.group(`🤖 Response Completed - ${message.id}`);
    console.log('📊 Metrics:', {
      finishReason,
      responseTime: `${responseTime}ms`,
      model: metrics.model,
    });
    if (tokenUsage) {
      console.log('🪙 Token Usage:', {
        input: tokenUsage.inputTokens,
        output: tokenUsage.outputTokens,
        total: tokenUsage.totalTokens,
      });
    }
    console.groupEnd();
  }, [model]);

  const { messages, sendMessage, status } = useChat({
    onFinish,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      const startTime = Date.now();
      
      sendMessage(
        { text: input },
        {
          body: {
            model: rai.chatModel(model),
            webSearch: webSearch,
            startTime, // Track start time for response time calculation
          },
        },
      );
      setInput('');
    }
  };

  return (
    <div className="w-full p-6 relative size-full h-screen">
      <div className="flex flex-col h-full">
        <Conversation className="h-full">
          <ConversationContent>
            {messages.map((message) => (
              <div key={message.id}>
                {message.role === 'assistant' && (
                  <Sources>
                    <SourcesTrigger
                      count={
                        message.parts.filter(
                          (part) => part.type === 'source-url',
                        ).length
                      }
                    />
                    {message.parts.filter((part) => part.type === 'source-url').map((part, i) => (
                      <SourcesContent key={`${message.id}-${i}`}>
                        <Source
                          key={`${message.id}-${i}`}
                          href={part.url}
                          title={part.url}
                        />
                      </SourcesContent>
                    ))}
                  </Sources>
                )}
                <Message from={message.role} key={message.id}>
                  <MessageContent>
                    {message.parts.map((part, i) => {
                      switch (part.type) {
                        case 'text':
                          return (
                            <Response key={`${message.id}-${i}`}>
                              {part.text}
                            </Response>
                          );
                        case 'reasoning':
                          return (
                            <Reasoning
                              key={`${message.id}-${i}`}
                              className="w-full"
                              isStreaming={status === 'streaming'}
                            >
                              <ReasoningTrigger />
                              <ReasoningContent>{part.text}</ReasoningContent>
                            </Reasoning>
                          );
                        default:
                          return null;
                      }
                    })}
                  </MessageContent>
                </Message>
                {/* Show metrics for assistant messages */}
                {message.role === 'assistant' && (
                  <div className="text-xs text-gray-500 mt-1 pl-4">
                    {(() => {
                      const metric = responseMetrics.find(m => m.id === message.id);
                      if (metric) {
                        return (
                          <div className="flex gap-4">
                            <span>⏱️ {metric.responseTime}ms</span>
                            {metric.tokenUsage && (
                              <span>
                                🪙 {metric.tokenUsage.inputTokens || 0}→{metric.tokenUsage.outputTokens || 0}
                                ({metric.tokenUsage.totalTokens || 0} total)
                              </span>
                            )}
                            <span>🤖 {metric.model}</span>
                          </div>
                        );
                      }
                      return null;
                    })()}
                  </div>
                )}
              </div>
            ))}
            {status === 'submitted' && <Loader />}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

        {/* Metrics Display */}
        {responseMetrics.length > 0 && (
          <div className="mt-4 p-4 bg-gray-50 rounded-lg">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-sm font-semibold">Response Metrics</h3>
              <div className="text-xs text-gray-600">
                {(() => {
                  const totalTokens = responseMetrics.reduce((sum, m) => sum + (m.tokenUsage?.totalTokens || 0), 0);
                  const avgResponseTime = Math.round(responseMetrics.reduce((sum, m) => sum + m.responseTime, 0) / responseMetrics.length);
                  return (
                    <span>
                      📊 {responseMetrics.length} responses • ⏱️ {avgResponseTime}ms avg • 🪙 {totalTokens} total tokens
                    </span>
                  );
                })()}
              </div>
            </div>
            <div className="space-y-2 max-h-32 overflow-y-auto">
              {responseMetrics.slice(-5).map((metric, index) => (
                <div key={metric.id} className="text-xs bg-white p-2 rounded border">
                  <div className="flex justify-between items-center">
                    <span className="font-medium">Response #{responseMetrics.length - 4 + index}</span>
                    <span className="text-gray-500">{metric.model}</span>
                  </div>
                  <div className="flex justify-between mt-1">
                    <span>⏱️ {metric.responseTime}ms</span>
                    {metric.tokenUsage && (
                      <span>
                        🪙 {metric.tokenUsage.inputTokens || 0}→{metric.tokenUsage.outputTokens || 0} 
                        ({metric.tokenUsage.totalTokens || 0} total)
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <PromptInput onSubmit={handleSubmit} className="mt-4">
          <PromptInputTextarea
            onChange={(e) => setInput(e.target.value)}
            value={input}
          />
          <PromptInputToolbar>
            <PromptInputTools>
              <PromptInputButton
                variant={webSearch ? 'default' : 'ghost'}
                onClick={() => setWebSearch(!webSearch)}
              >
                <GlobeIcon size={16} />
                <span>Search</span>
              </PromptInputButton>
              <PromptInputModelSelect
                onValueChange={(value) => {
                  setModel(value);
                }}
                value={model}
              >
                <PromptInputModelSelectTrigger>
                  <PromptInputModelSelectValue />
                </PromptInputModelSelectTrigger>
                <PromptInputModelSelectContent>
                  {models.map((model) => (
                    <PromptInputModelSelectItem key={model.value} value={model.value}>
                      {model.name}
                    </PromptInputModelSelectItem>
                  ))}
                </PromptInputModelSelectContent>
              </PromptInputModelSelect>
            </PromptInputTools>
            <PromptInputSubmit disabled={!input} status={status} />
          </PromptInputToolbar>
        </PromptInput>
      </div>
    </div>
  );
};

export default ChatBotDemo;