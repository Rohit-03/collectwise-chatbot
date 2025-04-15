

import React, { useState, useEffect, useRef } from 'react';
import { ChatMessage, initializeAssistant, sendMessage } from '../lib/assistantLogic';
import ChatBubble from './ChatBubble';
import LoadingIndicator from './LoadingIndicator';

const ChatInterface: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLDivElement>(null);
  
  // Initialize chat when component mounts
  useEffect(() => {
    const startChat = async () => {
      setIsLoading(true);
      try {
        await initializeAssistant();
        
        // Get initial message from assistant with a proper initialization message
        const initialMessage = await sendMessage("Start the conversation");
        setMessages([initialMessage]);
      } catch (error) {
        console.error('Error initializing chat:', error);
        const errorMessage: ChatMessage = {
          id: Date.now().toString(),
          message: "I'm sorry, I encountered an error initializing the chat. Please refresh the page.",
          isBot: true,
          displayType: 'text',
          displayData: null
        };
        setMessages([errorMessage]);
      } finally {
        setIsLoading(false);
      }
    };
    
    startChat();
  }, []);
  
  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);
  
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    
    // Add user message
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      message: input,
      isBot: false,
      displayType: 'text',
      displayData: null
    };
    
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    
    // Get response from assistant
    try {
      const botResponse = await sendMessage(input);
      setMessages(prev => [...prev, botResponse]);
    } catch (error) {
      console.error('Error getting response:', error);
      const errorMessage: ChatMessage = {
        id: Date.now().toString(),
        message: 'Sorry, there was an error processing your request. Please try again.',
        isBot: true,
        displayType: 'text',
        displayData: null
      };
      setMessages(prev => [...prev, errorMessage]);
    }
    
    setIsLoading(false);
  };
  
  return (
    <div className="flex h-full flex-col">
      {/* Main container with styling to match the image */}
      <div 
        className="flex-1 flex flex-col overflow-hidden rounded-3xl border border-black/10"
        style={{
          background: 'white',
          fontFamily: '"Inter", sans-serif',
        }}
      >
        {/* Messages Area with top padding */}
        <div className="flex-1 overflow-y-auto p-6 pt-12">
          {messages.map(message => (
            <ChatBubble key={message.id} message={message} />
          ))}
          {isLoading && <LoadingIndicator />}
          <div ref={messagesEndRef} />
        </div>
        
        {/* Input Area with styling to match the image */}
        <div ref={inputRef} className="flex-shrink-0 p-6 pt-2">
          <form onSubmit={handleSendMessage} className="mx-auto max-w-3xl">
            <div className="relative flex flex-col items-center rounded-3xl bg-white p-4 shadow-[0_0_15px_rgba(0,0,0,0.1)] border border-black/10">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Enter a command..."
                className="w-full rounded-3xl bg-transparent px-4 py-3 text-gray-900 placeholder:text-gray-400 focus:outline-none"
                style={{
                  fontFamily: '"Inter", sans-serif',
                  fontSize: '18px',
                  fontWeight: 500,
                  color: 'rgb(51, 51, 51)',
                  letterSpacing: '0px',
                  lineHeight: '1.5em',
                }}
              />
              <div className="mt-2 flex w-full items-center justify-end">
                <button
                  type="submit"
                  disabled={isLoading || !input.trim()}
                  className="rounded-3xl p-2 text-gray-500 hover:bg-gray-100 disabled:opacity-50"
                >
                  <svg className="h-6 w-6 transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                </button>
              </div>
            </div>
          </form>
        </div>
        
        {/* Bottom padding to match the image */}
        <div className="flex-shrink-0 pb-6"></div>
      </div>
    </div>
  );
};

export default ChatInterface;