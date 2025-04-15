import OpenAI from 'openai';
import { v4 as uuidv4 } from 'uuid';

export type ChatMessage = {
  id: string;
  message: string;
  isBot: boolean;
  displayType?: 'text' | 'paymentPlans' | 'finalPlan';
  displayData?: PaymentPlan[] | FinalPaymentPlan | null;
};

export type PaymentPlan = {
  frequency: 'weekly' | 'biweekly' | 'monthly';
  amount: number;
  termLength: number;
  totalAmount: number;
};

export type FinalPaymentPlan = {
  frequency: string;
  amount: number;
  termLength: number;
  totalAmount: number;
  paymentLink?: string;
};

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.NEXT_PUBLIC_OPENAI_API_KEY,
  dangerouslyAllowBrowser: true,
});

// Store thread and assistant IDs
let threadId: string | null = null;
let assistantId: string | null = null;

// Define our tools/functions for the assistant
const tools: OpenAI.Beta.AssistantTool[] = [
  {
    type: "function" as const,
    function: {
      name: "evaluatePaymentProposal",
      description: "Evaluate if a user's proposed payment plan is reasonable and feasible",
      parameters: {
        type: "object",
        properties: {
          proposedAmount: {
            type: "number",
            description: "The amount the user proposes to pay per term (weekly/biweekly/monthly)"
          },
          frequency: {
            type: "string",
            enum: ["weekly", "biweekly", "monthly"],
            description: "How often the user proposes to make payments"
          },
          termLength: {
            type: "number",
            description: "Number of terms (weeks/months) the user proposes to pay over"
          },
          debtAmount: {
            type: "number",
            description: "The total debt amount"
          },
          userFinancialContext: {
            type: "string",
            description: "Context about user's financial situation (income, employment status, etc.)"
          }
        },
        required: ["proposedAmount", "frequency", "termLength", "debtAmount"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "suggestPaymentPlans",
      description: "Generate multiple payment plan options based on user's financial situation",
      parameters: {
        type: "object",
        properties: {
          debtAmount: {
            type: "number",
            description: "Total debt amount"
          },
          userIncome: {
            type: "number",
            description: "User's monthly or regular income if provided"
          },
          canPayNow: {
            type: "boolean",
            description: "Whether the user can pay anything immediately"
          },
          immediatePaymentAmount: {
            type: "number",
            description: "Amount user can pay immediately if any"
          },
          financialConstraints: {
            type: "string",
            description: "Any specific financial constraints mentioned by the user"
          }
        },
        required: ["debtAmount"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "finalizePlan",
      description: "If teh user agrees to a plan, create a final payment plan and generate payment link",
      parameters: {
        type: "object",
        properties: {
          frequency: {
            type: "string",
            enum: ["weekly", "biweekly", "monthly"],
            description: "How often payments will be made"
          },
          amount: {
            type: "number",
            description: "Amount per payment"
          },
          termLength: {
            type: "number",
            description: "Number of terms (weeks/months) for the payment plan"
          },
          totalAmount: {
            type: "number",
            description: "Total debt amount to be paid"
          }
        },
        required: ["frequency", "amount", "termLength", "totalAmount"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "formatStructuredResponse",
      description: "Format a structured response with specialized display elements",
      parameters: {
        type: "object",
        properties: {
          message: {
            type: "string",
            description: "Text message to display"
          },
          displayType: {
            type: "string",
            enum: ["text", "paymentPlans", "finalPlan"],
            description: "Type of specialized display to show"
          },
          plans: {
            type: "array",
            items: {
              type: "object",
              properties: {
                frequency: {
                  type: "string",
                  enum: ["weekly", "biweekly", "monthly"]
                },
                amount: {
                  type: "number"
                },
                termLength: {
                  type: "number"
                },
                totalAmount: {
                  type: "number"
                }
              }
            },
            description: "Array of payment plans (only when displayType is 'paymentPlans')"
          },
          finalPlan: {
            type: "object",
            properties: {
              frequency: {
                type: "string",
                enum: ["weekly", "biweekly", "monthly"]
              },
              amount: {
                type: "number"
              },
              termLength: {
                type: "number"
              },
              totalAmount: {
                type: "number"
              },
              paymentLink: {
                type: "string"
              }
            },
            description: "Final payment plan details (only when displayType is 'finalPlan')"
          }
        },
        required: ["message", "displayType"]
      }
    }
  }
];

// Function implementations
export const evaluatePaymentProposal = (
  proposedAmount: number,
  frequency: string,
  termLength: number,
  debtAmount: number,
  userFinancialContext: string = ""
): { isReasonable: boolean; reason: string; counterProposal?: PaymentPlan } => {
  const totalProposed = proposedAmount * termLength;
  
  // Check if proposal covers the debt
  if (totalProposed < debtAmount) {
    return {
      isReasonable: false,
      reason: "The proposed plan doesn't cover the full debt amount.",
      counterProposal: {
        frequency: frequency as PaymentPlan['frequency'],
        amount: Math.ceil(debtAmount / termLength),
        termLength,
        totalAmount: debtAmount
      }
    };
  }
  
  // Check if term length is too long (more than 12 months)
  if ((frequency === 'monthly' && termLength > 12) || 
      (frequency === 'biweekly' && termLength > 26) || 
      (frequency === 'weekly' && termLength > 52)) {
    // Calculate a more reasonable term length
    const reasonableTerms = frequency === 'monthly' ? 6 : 
                           frequency === 'biweekly' ? 12 : 24;
    
    return {
      isReasonable: false,
      reason: "The proposed payment period is too long.",
      counterProposal: {
        frequency: frequency as PaymentPlan['frequency'],
        amount: Math.ceil(debtAmount / reasonableTerms),
        termLength: reasonableTerms,
        totalAmount: debtAmount
      }
    };
  }
  
  // Check if payment amount is unreasonably low
  const minReasonableAmount = 
    frequency === 'monthly' ? debtAmount * 0.08 : 
    frequency === 'biweekly' ? debtAmount * 0.04 : 
    debtAmount * 0.02;
  
  if (proposedAmount < minReasonableAmount) {
    const reasonableAmount = Math.ceil(minReasonableAmount);
    const reasonableTerms = Math.ceil(debtAmount / reasonableAmount);
    
    return {
      isReasonable: false,
      reason: "The proposed payment amount is too low for effective debt resolution.",
      counterProposal: {
        frequency: frequency as PaymentPlan['frequency'],
        amount: reasonableAmount,
        termLength: reasonableTerms,
        totalAmount: debtAmount
      }
    };
  }
  
  // If we get here, the proposal is reasonable
  return {
    isReasonable: true,
    reason: "This is a reasonable payment plan."
  };
};

export const suggestPaymentPlans = (
  debtAmount: number,
  userIncome: number = 0,
  canPayNow: boolean = false,
  immediatePaymentAmount: number = 0,
  financialConstraints: string = ""
): PaymentPlan[] => {
  const remainingDebt = debtAmount - (canPayNow ? immediatePaymentAmount : 0);
  const plans: PaymentPlan[] = [];
  
  // Determine reasonable payment amounts based on income if available
  const affordabilityFactor = userIncome > 0 ? Math.min(0.2, remainingDebt / (userIncome * 6)) : 0.15;
  const preferredMonthlyPayment = userIncome > 0 ? Math.min(userIncome * affordabilityFactor, remainingDebt / 3) : remainingDebt / 6;
  
  // Short term plan (3-4 months)
  plans.push({
    frequency: 'monthly',
    amount: Math.ceil(remainingDebt / 3),
    termLength: 3,
    totalAmount: remainingDebt
  });
  
  // Medium term plan (6 months)
  plans.push({
    frequency: 'monthly',
    amount: Math.ceil(remainingDebt / 6),
    termLength: 6,
    totalAmount: remainingDebt
  });
  
  // Income-based plan (if income information is available)
  if (userIncome > 0) {
    const termLength = Math.ceil(remainingDebt / preferredMonthlyPayment);
    plans.push({
      frequency: 'monthly',
      amount: Math.ceil(preferredMonthlyPayment),
      termLength: Math.min(termLength, 12),
      totalAmount: remainingDebt
    });
  }
  
  // Biweekly option
  plans.push({
    frequency: 'biweekly',
    amount: Math.ceil(remainingDebt / 12),
    termLength: 12,
    totalAmount: remainingDebt
  });
  
  // Weekly option for smaller amounts
  if (remainingDebt <= 2000) {
    plans.push({
      frequency: 'weekly',
      amount: Math.ceil(remainingDebt / 16),
      termLength: 16,
      totalAmount: remainingDebt
    });
  }
  
  return plans;
};

export const finalizePlan = (
  frequency: string,
  amount: number,
  termLength: number,
  totalAmount: number
): FinalPaymentPlan => {
  const paymentLink = `collectwise.com/payments?termLength=${termLength}&totalDebtAmount=${totalAmount}&termPaymentAmount=${amount}`;
  
  return {
    frequency: frequency as PaymentPlan['frequency'],
    amount,
    termLength,
    totalAmount,
    paymentLink
  };
};

export const formatStructuredResponse = (
  message: string,
  displayType: 'text' | 'paymentPlans' | 'finalPlan',
  plans?: PaymentPlan[],
  finalPlan?: FinalPaymentPlan
): ChatMessage => {
  return {
    id: uuidv4(),
    message,
    isBot: true,
    displayType,
    displayData: displayType === 'paymentPlans' ? plans : 
                displayType === 'finalPlan' ? finalPlan : null
  };
};

// Initialize the assistant
export const initializeAssistant = async (debtAmount: number = 2400) => {
  if (!assistantId) {
    const assistant = await openai.beta.assistants.create({
      name: "CollectWise Debt Negotiation Assistant",
      model: "gpt-4-turbo",
      tools: tools,
      instructions: `
      
        You are a debt negotiation chatbot for CollectWise. Your role is to help users resolve their debt of $${debtAmount} in a friendly, empathetic, but effective manner. The goal is to come to an agreement that works for the user and also prioritizes collecting debt in the shortest amount of time.

        IMPORTANT GUIDELINES:
        MAIN GOAL: Reach an agreement as fast as possible. As soon as the user says yes immedietly proceede to confirmation.


        Always push the conversation forward and be proactive (At the end of the negotiation messages, ask if the user can confirm or if that looks good and would like to proceede)

        1. BE CONVERSATIONAL AND CONCISE: Use short messages (1-2 sentences max per message) that feel natural and friendly, not overwhelming.

        1.5) Talk in a polite and empathetic way.

        2. START THE CONVERSATION: Begin by stating: "Hi there! I noticed you have a debt of  ($${debtAmount}) and ask if they can pay it today.

        3. GATHER INFORMATION GRADUALLY: If they can't pay, ask if they would be providing more information on their current situation to get a more personalized plan, or if they would just like to continue.
        - ask specific questions about their situation one at a time, if the user would like to share
        - What they think would be a manageable monthly, weekly, or biweekly payment (make sure to aknowladge all 3 options)

        4. BE STRATEGIC IN NEGOTIATION:
        - Never accept unrealistically low payments (like $5/month for many years)
        - Guide users toward reasonable payment plans (ideally 3–12 months)
        - Use the evaluatePaymentProposal function when users propose specific payment terms
        - When suggesting payment plans, ALWAYS use the formatStructuredResponse function with displayType='paymentPlans' and include the plans array
        - ✅ When rejecting an unreasonable user-proposed plan or suggesting a new plan, include a **very brief 1-sentence justification** explaining *why* the plan is more realistic (e.g., “This plan collects the balance within a reasonable timeframe based on your debt amount.”)

        5. BE ADAPTABLE AND FLEXIBLE:
        - Always acknowledge financial hardship with empathy
        - When changing payment frequency (e.g., from monthly to weekly), recalculate the amounts and terms accordingly
        - If a user requests to change the frequency of an existing plan (e.g., "make it biweekly"), automatically convert the current plan to the new frequency while maintaining the same total amount and term length
        - Only ask for clarification if the request is unclear or if the user specifically asks for a different amount

        6. FINALIZE WITH CLARITY:
        - When reaching an agreement, use the finalizePlan function to generate payment details
        - Then use formatStructuredResponse with displayType='finalPlan' to display the confirmed plan
        - Thank them for working together on a solution

        7. RESPONSE STRUCTURE:
        - ALWAYS use the formatStructuredResponse function to generate structured responses
        - For regular messages, use displayType='text'
        - For payment options, use displayType='paymentPlans' and include the plans array
        - For final agreements, use displayType='finalPlan' and include the finalPlan object
        - NEVER send payment plans or final plans as plain text messages

        Remember to be patient, empathetic, but also goal-oriented. Your objective is to find a payment solution that works for both the user and CollectWise.

      `
    });
    
    assistantId = assistant.id;
  }
  
  // Create a new thread for the conversation
  const thread = await openai.beta.threads.create();
  threadId = thread.id;
  
  return {
    threadId,
    assistantId
  };
};

// Helper function to parse function call arguments
const parseFunctionArgs = (argsString: string) => {
  try {
    return JSON.parse(argsString);
  } catch (e) {
    console.error("Failed to parse function arguments:", e);
    return {};
  }
};

// Send message and handle function calls
export const sendMessage = async (userMessage: string): Promise<ChatMessage> => {
  if (!threadId || !assistantId) {
    await initializeAssistant();
  }
  
  // Add user message to thread
  await openai.beta.threads.messages.create(threadId!, {
    role: "user",
    content: userMessage
  });
  
  // Run the assistant
  const run = await openai.beta.threads.runs.create(threadId!, {
    assistant_id: assistantId!
  });
  
  // Poll for response or tool calls
  let completed = false;
  let response: ChatMessage = {
    id: uuidv4(),
    message: "",
    isBot: true,
    displayType: "text",
    displayData: null
  };
  
  while (!completed) {
    const runStatus = await openai.beta.threads.runs.retrieve(threadId!, run.id);
    
    if (runStatus.status === "requires_action" && runStatus.required_action?.type === "submit_tool_outputs") {
      const toolCalls = runStatus.required_action.submit_tool_outputs.tool_calls;
      const toolOutputs = [];
      
      for (const toolCall of toolCalls) {
        const functionName = toolCall.function.name;
        const args = parseFunctionArgs(toolCall.function.arguments);
        
        let result;
        if (functionName === "evaluatePaymentProposal") {
          result = evaluatePaymentProposal(
            args.proposedAmount,
            args.frequency,
            args.termLength,
            args.debtAmount,
            args.userFinancialContext || ""
          );
        } else if (functionName === "suggestPaymentPlans") {
          result = suggestPaymentPlans(
            args.debtAmount,
            args.userIncome || 0,
            args.canPayNow || false,
            args.immediatePaymentAmount || 0,
            args.financialConstraints || ""
          );
        } else if (functionName === "finalizePlan") {
          result = finalizePlan(
            args.frequency,
            args.amount,
            args.termLength,
            args.totalAmount
          );
        } else if (functionName === "formatStructuredResponse") {
          // Special handling for formatStructuredResponse to capture structured output
          response = formatStructuredResponse(
            args.message,
            args.displayType,
            args.plans,
            args.finalPlan
          );
          result = { success: true };
        }
        
        toolOutputs.push({
          tool_call_id: toolCall.id,
          output: JSON.stringify(result)
        });
      }
      
      // Submit tool outputs back to the assistant
      await openai.beta.threads.runs.submitToolOutputs(threadId!, run.id, {
        tool_outputs: toolOutputs
      });
    } else if (runStatus.status === "completed") {
      // If we haven't captured a structured response yet, get the plain text message
      if (!response.message) {
        const messages = await openai.beta.threads.messages.list(threadId!);
        const assistantMessages = messages.data.filter(msg => msg.role === "assistant");
        
        if (assistantMessages.length > 0 && assistantMessages[0].content[0].type === "text") {
          response.message = assistantMessages[0].content[0].text.value;
        }
      }
      
      completed = true;
    } else if (["failed", "cancelled", "expired"].includes(runStatus.status)) {
      response.message = "I'm sorry, I encountered an issue while processing your request. Could we try again?";
      completed = true;
    } else {
      // Wait before polling again
    //   await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  return response;
};