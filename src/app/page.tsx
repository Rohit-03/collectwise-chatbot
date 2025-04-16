"use client";
import React from 'react';
import ChatInterface from '../components/ChatInterface';

export default function Home() {
  return (
    <main
    className="flex min-h-screen flex-col p-4 md:p-8"
    style={{
      background: 'linear-gradient(to bottom,rgb(255, 255, 255) 60%,rgb(219, 231, 253) 100%)',
    }}
  >
  
      {/* Logo in Top Left */}
      <div className="absolute left-5 top-6">
        <img src="/logo.png" alt="CollectWise Logo" className="h-17 w-auto" />
      </div>

      <div className="mx-auto flex w-full max-w-3xl flex-col">
        {/* Header */}
        <div className="mb-6 text-center mt-6">
          <h1 className="mb-2 text-[40px] font-semibold leading-[1.3em] tracking-[-.01em] text-[#212121] text-center font-[Inter,sans-serif]">
            
          </h1>
        </div>

        {/* Chat Container */}
        <div className="h-[80vh] w-full rounded-3xl shadow-xl">
          <ChatInterface />
        </div>
      </div>
    </main>
  );
}
