import React from 'react';
import { PaymentPlan } from '../lib/assistantLogic';

interface PaymentPlansDisplayProps {
  plans: PaymentPlan[];
}

const PaymentPlansDisplay: React.FC<PaymentPlansDisplayProps> = ({ plans }) => {
  // Helper function to format duration text
  const getDurationText = (plan: PaymentPlan) => {
    if (plan.frequency === 'monthly') {
      return `${plan.termLength} months`;
    } else if (plan.frequency === 'weekly') {
      return `${plan.termLength} weeks`;
    } else {
      // For biweekly, calculate total number of payments
      return `${plan.termLength} bi-weekly (${plan.termLength * 2} payments)`;
    }
  };

  return (
    <div className="my-4 w-full">
      <div className="mb-4 flex items-center gap-2">
        <span className="text-xl">Suggested Payment Plans</span>
      </div>
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Plan</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Frequency</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Amount</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Duration</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {plans.map((plan, index) => (
              <tr key={index} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-sm font-medium text-blue-800">
                    {index + 1}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-900">
                  {plan.frequency.charAt(0).toUpperCase() + plan.frequency.slice(1)}
                </td>
                <td className="px-4 py-3 text-sm text-gray-900">${plan.amount}</td>
                <td className="px-4 py-3 text-sm text-gray-900">{getDurationText(plan)}</td>
                <td className="px-4 py-3 text-sm font-medium text-gray-900">${plan.totalAmount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default PaymentPlansDisplay;