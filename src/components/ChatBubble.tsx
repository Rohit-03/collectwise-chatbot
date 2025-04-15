

import React from 'react';
import { ChatMessage } from '../lib/assistantLogic';
import PaymentPlansDisplay from './PaymentPlansDisplay';
import FinalPaymentPlanDisplay from './FinalPaymentPlanDisplay';

interface ChatBubbleProps {
  message: ChatMessage;
}

const ChatBubble: React.FC<ChatBubbleProps> = ({ message }) => {
  // Generate payment link element if present in finalPlan
  const renderPaymentLink = () => {
    const finalPlan = message.displayData as any;
    if (message.displayType === 'finalPlan' && finalPlan?.paymentLink) {
      return (
        <div className="mt-4">
          <a 
            href={`https://${finalPlan.paymentLink}`} 
            className="inline-block w-full rounded-xl bg-blue-100 px-4 py-2 text-center text-sm font-medium text-blue-800 hover:bg-blue-200 transition"
            target="_blank" 
            rel="noopener noreferrer"
          >
            🔗 Click here to make your payment
          </a>
        </div>
      );
    }
    return null;
  };

  return (
    <div className={`mb-4 flex ${message.isBot ? 'justify-start' : 'justify-end'}`}>
      <div 
        className={`max-w-[85%] rounded-3xl px-4 py-2 shadow ${
          message.isBot ? 'bg-gray-10 text-gray-800' : 'bg-gray-100 text-gray-800'
        } font-[Inter,sans-serif] text-[18px] font-medium`}
      >
        {/* Display based on message type */}
        {message.displayType === 'paymentPlans' && message.displayData && (
          <>
            <PaymentPlansDisplay plans={message.displayData as any} />
            <p className="mt-4">{message.message}</p>
          </>
        )}
        
        {message.displayType === 'finalPlan' && message.displayData && (
          <>
            <FinalPaymentPlanDisplay plan={message.displayData as any} />
            <p className="mt-4">{message.message}</p>
            {renderPaymentLink()}
          </>
        )}
        
        {(!message.displayType || message.displayType === 'text') && (
          <p className="whitespace-pre-wrap">{message.message}</p>
        )}
      </div>
    </div>
  );
};

export default ChatBubble;