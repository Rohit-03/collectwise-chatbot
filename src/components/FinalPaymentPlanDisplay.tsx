import React from 'react';
import { FinalPaymentPlan } from '../lib/assistantLogic';

interface FinalPaymentPlanDisplayProps {
  plan: FinalPaymentPlan;
}

const FinalPaymentPlanDisplay: React.FC<FinalPaymentPlanDisplayProps> = ({ plan }) => {
  const getFrequencyText = () => {
    return plan.frequency.charAt(0).toUpperCase() + plan.frequency.slice(1);
  };

  return (
    <div className="mt-6 rounded-2xl bg-white p-6 shadow-xl ring-1 ring-gray-200">
      <h2 className="mb-6 text-lg font-semibold text-gray-800 flex items-center gap-2">
        <span className="text-blue-600 text-xl">Final Payment Plan</span>
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-xl border border-gray-100 p-4 bg-gray-50">
          <div className="text-sm text-gray-500">Payment Per Term</div>
          <div className="mt-1 text-xl font-semibold text-gray-800">${plan.amount}</div>
        </div>

        <div className="rounded-xl border border-gray-100 p-4 bg-gray-50">
          <div className="text-sm text-gray-500">Frequency</div>
          <div className="mt-1 text-base font-medium text-gray-800">{getFrequencyText()}</div>
        </div>

        <div className="rounded-xl border border-gray-100 p-4 bg-gray-50">
          <div className="text-sm text-gray-500">Term Length</div>
          <div className="mt-1 text-base font-medium text-gray-800">{plan.termLength}</div>
        </div>

        <div className="rounded-xl border border-gray-100 p-4 bg-blue-50">
          <div className="text-sm text-blue-700 font-medium">Total Amount Due</div>
          <div className="mt-1 text-xl font-bold text-blue-800">${plan.totalAmount}</div>
        </div>
      </div>
      
    </div>
    
       
  );
};

export default FinalPaymentPlanDisplay;
