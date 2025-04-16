

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
let currentDebtAmount: number = 2400; // Default value
let negotiationStage: number = 0; // Track negotiation stage (0: initial, increases with each offer)

// Define our tools/functions for the assistant
const tools: OpenAI.Beta.AssistantTool[] = [
  {
    type: "function" as const,
    function: {
      name: "evaluateAndNegotiate",
      description: "Evaluate a proposed payment plan and suggest a reasonable counteroffer if needed, following negotiation principles. Try to keep payments higher than minimum when possible.",
      parameters: {
        type: "object",
        properties: {
          userProposal: {
            type: "object",
            properties: {
              amount: { type: "number" },
              frequency: { type: "string", enum: ["weekly", "biweekly", "monthly"] },
              termLength: { type: "number" }
            },
            description: "The payment plan proposed by the user"
          },
          debtAmount: { type: "number" },
          userSituation: { type: "string" },
          // negotiationHistory: { type: "string" },
          response: {
            type: "object",
            properties: {
              message: { type: "string" },
              isReasonable: { type: "boolean" },
              counterProposal: {
                type: "object",
                properties: {
                  frequency: { type: "string", enum: ["weekly", "biweekly", "monthly"] },
                  amount: { type: "number" },
                  termLength: { type: "number" },
                  totalAmount: { type: "number" }
                }
              }
            }
          }
        },
        required: ["userProposal", "debtAmount", "response"]
      }
    }
  },

  {
    type: "function",
    function: {
      name: "suggestPlan",
      description: "ALWAYS use this function when suggesting a new payment plan to the user. Follows negotiation principles to suggest reasonable plans.",
      parameters: {
        type: "object",
        properties: {
          proposedPlan: {
            type: "object",
            properties: {
              frequency: { 
                type: "string", 
                enum: ["weekly", "biweekly", "monthly"] 
              },
              amount: { type: "number" },
              termLength: { type: "number" }
            },
            description: "The payment plan you want to suggest"
          },
          debtAmount: { type: "number" },
          userSituation: { type: "string" },
          message: { type: "string" }
        },
        required: ["proposedPlan", "debtAmount", "message"]
      }
    }
  },

  {
    type: "function",
    function: {
      name: "finalizePlan",
      description: "Create a final payment plan and generate payment link. This function enforces hard minimum thresholds with no exceptions.",
      parameters: {
        type: "object",
        properties: {
          plan: {
            type: "object",
            properties: {
              frequency: { 
                type: "string", 
                enum: ["weekly", "biweekly", "monthly"] 
              },
              amount: { type: "number" },
              termLength: { type: "number" },
              totalAmount: { type: "number" }
            },
            description: "The final agreed payment plan"
          },
          userDetails: {
            type: "string",
            description: "Any user details that should be associated with this plan"
          },
          message: {
            type: "string",
            description: "Confirmation message to send to the user"
          }
        },
        required: ["plan", "message"]
      }
    }
  }
];

/**
 * Calculate absolute minimum allowed payment for a frequency
 */
const getMinimumPayment = (frequency: string, debtAmount: number): number => {
  const minRates = { monthly: 0.08, biweekly: 0.04, weekly: 0.02 };
  return Math.ceil(debtAmount * (minRates[frequency as keyof typeof minRates] || 0.08));
};

/**
 * Evaluate and negotiate a payment proposal
 * This version focuses on proper negotiation technique rather than immediately
 * suggesting the minimum acceptable plan
 */
export const evaluateAndNegotiate = (
  userProposal: {
    amount: number;
    frequency: string;
    termLength: number;
  },
  debtAmount: number,
  userSituation: string = "",
  // negotiationHistory: string = "",
  response: {
    message: string;
    isReasonable: boolean;
    counterProposal?: PaymentPlan;
  }
): ChatMessage => {
  const { amount, frequency, termLength } = userProposal;
  const allowedFrequencies = ["weekly", "biweekly", "monthly"];
  
  // Hard validation for frequency
  if (!allowedFrequencies.includes(frequency)) {
    return createCounterProposal(
      "Invalid payment frequency. Only weekly, biweekly, or monthly are allowed.",
      "monthly",
      6,
      debtAmount
    );
  }

  // Calculate minimum payment threshold (hard limit for finalization)
  const absoluteMinPayment = getMinimumPayment(frequency, debtAmount);
  
  // Calculate total proposed
  const totalProposed = amount * termLength;
  
  // Validate total amount equals debt
  if (totalProposed < debtAmount) {
    // User's plan doesn't cover full debt
    // Instead of going straight to minimum, offer something in between
    // This preserves negotiation approach
    
    // If very low, suggest 25% higher than minimum
    if (amount < absoluteMinPayment) {
      const suggestedAmount = Math.ceil(absoluteMinPayment * 1.25);
      const suggestedTerm = Math.ceil(debtAmount / suggestedAmount);
      
      return createCounterProposal(
        "I appreciate your situation, but we need a plan that covers the full debt amount in a reasonable time. Here's a suggested plan that works better.",
        frequency,
        suggestedTerm,
        debtAmount
      );
    }
    // Otherwise, keep their amount but adjust the term
    else {
      const adjustedTerm = Math.ceil(debtAmount / amount);
      return createCounterProposal(
        "Your payment amount looks good, but we need to adjust the term to cover the full debt.",
        frequency,
        adjustedTerm,
        debtAmount
      );
    }
  }
  
  // If payment is below absolute minimum but user has mentioned hardship
  // We'll offer a counter that's more aggressive but still negotiable
  if (amount < absoluteMinPayment) {
    // Check for hardship indicators in situation
    const hasHardship = userSituation.toLowerCase().includes('hardship') || 
                      userSituation.toLowerCase().includes('laid off') ||
                      userSituation.toLowerCase().includes('medical') ||
                      userSituation.toLowerCase().includes('difficult');
                      
    // If hardship, suggest something 10% above minimum
    // If no hardship, suggest 25% above minimum
    const multiplier = hasHardship ? 1.1 : 1.25;
    const counterAmount = Math.ceil(absoluteMinPayment * multiplier);
    const counterTerm = Math.ceil(debtAmount / counterAmount);
    
    return createCounterProposal(
      hasHardship ? 
        "I understand your situation, but we need something a bit higher to make this work." :
        "We need to increase the payment amount to make this a viable arrangement.",
      frequency,
      counterTerm,
      debtAmount
    );
  }
  
  // If amount * termLength doesn't exactly equal debtAmount
  if (amount * termLength !== debtAmount) {
    // Keep the amount and adjust the term for better customer experience
    const adjustedTerm = Math.ceil(debtAmount / amount);
    return createCounterProposal(
      "Let me adjust the payment term slightly to make sure it covers the full debt.",
      frequency,
      adjustedTerm,
      debtAmount
    );
  }

  // Proposal is reasonable, pass through the message
  negotiationStage++; // Move negotiation forward
  return {
    id: uuidv4(),
    message: response.message || "This is a reasonable payment plan.",
    isBot: true,
    displayType: 'paymentPlans',
    displayData: [{
      frequency: frequency as PaymentPlan['frequency'],
      amount,
      termLength,
      totalAmount: debtAmount
    }]
  };
};

/**
 * Suggest a new payment plan to the user
 * This ensures all assistant suggestions follow proper negotiation strategy
 */
export const suggestPlan = (
  proposedPlan: {
    frequency: string;
    amount: number;
    termLength: number;
  },
  debtAmount: number,
  userSituation: string = "",
  message: string
): ChatMessage => {
  const { amount, frequency, termLength } = proposedPlan;
  const allowedFrequencies = ["weekly", "biweekly", "monthly"];
  
  // Hard validation for frequency
  if (!allowedFrequencies.includes(frequency)) {
    return createCounterProposal(
      "Our system only supports weekly, biweekly, or monthly payment frequencies.",
      "monthly",
      6,
      debtAmount,
      message
    );
  }

  // Get minimum payment for reference (hard limit)
  const absoluteMinPayment = getMinimumPayment(frequency, debtAmount);
  
  // Validate total covers full debt
  const calculatedTotal = amount * termLength;
  if (calculatedTotal !== debtAmount) {
    // Adjust plan to cover exact debt amount
    // Keep the proposed amount but adjust term
    const adjustedTerm = Math.ceil(debtAmount / amount);
    return createCounterProposal(
      "Let me adjust this plan to ensure it covers your total debt exactly.",
      frequency,
      adjustedTerm,
      debtAmount,
      message
    );
  }
  
  // Based on negotiation stage, adjust the suggestion appropriately
  // In earlier stages, we should be more aggressive with payment terms
  // In later stages, we can gradually reduce down (but not below absolute min)
  
  // Check if the proposed amount is way below minimum and we're not in late negotiation stage
  if (amount < absoluteMinPayment && negotiationStage < 2) {
    // Suggest a higher amount during early negotiation
    // But not as high as the minimum - leave room to negotiate down
    const suggestedAmount = Math.ceil(absoluteMinPayment * 1.5); // 50% higher than minimum
    const suggestedTerm = Math.ceil(debtAmount / suggestedAmount);
    
    return createCounterProposal(
      "I need to suggest a more effective payment plan.",
      frequency,
      suggestedTerm,
      debtAmount,
      message
    );
  }

  const hasHardship = userSituation.toLowerCase().includes('hardship') || 
                   userSituation.toLowerCase().includes('laid off') ||
                   userSituation.toLowerCase().includes('medical');

  // Adjust negotiation strategy based on situation
  if (hasHardship) {
    // Be more generous in early stages
    if (negotiationStage < 2) {
      const suggestedAmount = Math.ceil(absoluteMinPayment * 1.2); // Only 20% above min
      const suggestedTerm = Math.ceil(debtAmount / suggestedAmount);
      
      return createCounterProposal(
        "Here's a plan that might work better for you, based on your situation.",
        frequency,
        suggestedTerm,
        debtAmount,
        message
      );
    }
  }
  
  // Plan is valid for the current negotiation stage, return it with the provided message
  negotiationStage++; // Move negotiation forward
  
  const validPlan: PaymentPlan = {
    frequency: frequency as PaymentPlan['frequency'],
    amount: amount, 
    termLength: termLength,
    totalAmount: debtAmount
  };

  return {
    id: uuidv4(),
    message: message,
    isBot: true,
    displayType: 'paymentPlans',
    displayData: [validPlan]
  };
};

// Helper function to create counter proposals
function createCounterProposal(
  systemMessage: string,
  frequency: string,
  termLength: number,
  totalAmount: number,
  userMessage: string = ""
): ChatMessage {
  // Calculate regular payment amount (for all but the last payment)
  let regularAmount = Math.floor(totalAmount / termLength);
  
  // Calculate the final payment to ensure the total exactly equals the debt amount
  let finalPayment = totalAmount - (regularAmount * (termLength - 1));
  
  // If all payments are equal, use the regular amount
  // Otherwise, we'll adjust the message to inform about the final payment
  const isEqualPayments = regularAmount === finalPayment;
  const displayAmount = regularAmount;
  
  // Create payment plan with the exact totalAmount
  const counter: PaymentPlan = {
    frequency: frequency as PaymentPlan['frequency'],
    amount: displayAmount,
    termLength,
    totalAmount: totalAmount // Use the exact totalAmount passed in
  };
  
  // Use the provided user message if available, otherwise use system message
  let finalMessage = userMessage || systemMessage;
  
  // Add note about final payment if needed
  if (!isEqualPayments && !userMessage) {
    finalMessage = `${finalMessage} Note: The final payment will be $${finalPayment.toFixed(2)} to ensure the total exactly matches your debt amount.`;
  }

  negotiationStage++; // Move negotiation forward
  
  return {
    id: uuidv4(),
    message: finalMessage,
    isBot: true,
    displayType: 'paymentPlans',
    displayData: [counter]
  };
}

/**
 * Finalize a payment plan and generate payment link
 * This is the FINAL check that enforces hard minimum thresholds
 */
export const finalizePlan = (
  plan: {
    frequency: string;
    amount: number;
    termLength: number;
    totalAmount: number;
  },
  userDetails: string = "",
  message: string
): ChatMessage => {
  // At finalization, we MUST enforce minimum thresholds - NO EXCEPTIONS
  const absoluteMinPayment = getMinimumPayment(plan.frequency, plan.totalAmount);
  
  // Check if plan meets minimum payment requirements - FINAL HARD CHECK
  if (plan.amount < absoluteMinPayment) {
    // If plan doesn't meet requirements, return a message explaining why
    const minTerm = Math.ceil(plan.totalAmount / absoluteMinPayment);
    const betterPlan: PaymentPlan = {
      frequency: plan.frequency as PaymentPlan['frequency'],
      amount: absoluteMinPayment,
      termLength: minTerm,
      totalAmount: plan.totalAmount
    };
    
    return {
      id: uuidv4(),
      message: `I can't finalize this plan as it doesn't meet our minimum payment requirements. For a $${plan.totalAmount} debt, the minimum ${plan.frequency} payment is $${absoluteMinPayment}. Here's a better plan that meets our requirements.`,
      isBot: true,
      displayType: 'paymentPlans',
      displayData: [betterPlan]
    };
  }
  
  // If plan is valid, create payment link
  const paymentLink = `collectwise.com/payments?termLength=${plan.termLength}&totalDebtAmount=${plan.totalAmount}&termPaymentAmount=${plan.amount}`;
  
  const finalPlan: FinalPaymentPlan = {
    ...plan,
    paymentLink
  };
  
  // Reset negotiation stage for next conversation
  negotiationStage = 0;
  
  return {
    id: uuidv4(),
    message: message,
    isBot: true,
    displayType: 'finalPlan',
    displayData: finalPlan
  };
};

/**
 * Extract payment plans from text messages
 * This is used to intercept messages that might contain payment suggestions 
 * that weren't properly validated through our functions
 */
function extractPaymentPlan(text: string, debtAmount: number): { 
  found: boolean; 
  plan?: { 
    frequency: string; 
    amount: number; 
    termLength: number; 
  } 
} {
  // Pattern for dollar amounts like $400, $1,200, etc.
  const dollarPattern = /\$(\d{1,3}(?:,\d{3})*(?:\.\d{2})?|\d+(?:\.\d{2})?)/g;
  
  // Pattern for frequencies: weekly, biweekly, monthly
  const frequencyPattern = /\b(weekly|biweekly|monthly)\b/gi;
  
  // Pattern for term lengths like "for 6 months", "over 3 weeks", etc.
  const termPattern = /(?:for|over)\s+(\d+)\s+(week|month|payment|installment)/gi;
  
  // Extract data
  const dollarMatches = [...text.matchAll(dollarPattern)];
  const frequencyMatches = [...text.matchAll(frequencyPattern)];
  const termMatches = [...text.matchAll(termPattern)];
  
  if (dollarMatches.length > 0 && frequencyMatches.length > 0) {
    // Parse the first dollar amount
    const amountStr = dollarMatches[0][1].replace(/,/g, '');
    const amount = parseFloat(amountStr);
    
    // Parse the frequency
    const frequency = frequencyMatches[0][0].toLowerCase();
    
    // Default term length if not specified
    let termLength = 6; // Default
    
    // Try to extract term length
    if (termMatches.length > 0) {
      termLength = parseInt(termMatches[0][1]);
    } else {
      // If term not specified, calculate based on debt amount
      termLength = Math.ceil(debtAmount / amount);
    }
    
    return {
      found: true,
      plan: {
        frequency,
        amount,
        termLength
      }
    };
  }
  
  return { found: false };
}

// Initialize the assistant
export const initializeAssistant = async (debtAmount: number = 2400) => {
  currentDebtAmount = debtAmount; // Store for later use
  negotiationStage = 0; // Reset negotiation stage
  
  if (!assistantId) {
    const assistant = await openai.beta.assistants.create({
      name: "CollectWise Debt Negotiation Assistant",
      model: "gpt-4-turbo",
      tools: tools,
      instructions: `
      You are a debt negotiation assistant for CollectWise. Your role is to help users resolve their debt of $${debtAmount} through empathetic, intelligent negotiation.

Start with:  
"Hi! It looks like you have a debt of $${debtAmount}. Can you settle this today?"

If the user agrees, proceed with finalizePlan using a 1-day term.  
If not, acknowledge their situation and use the suggestPlan function to propose a plan that aims to resolve the debt in 3–6 months. If declined, soften terms gradually and negotiate.

---

GOAL:  
Come to an agreement as fast as possible while being understanding. Be proactive and drive the conversation forward.

---

CONVERSATION APPROACH:  
- Lead the conversation naturally. Never wait for the user to ask for options.  
- Use short, human, conversational messages (1–2 sentences).  
- Acknowledge hardship before offering solutions.  
- Be persuasive but supportive.

---

NEGOTIATION PRINCIPLES:  
- Start with more aggressive terms (shorter periods, higher amounts)
- Only reduce terms after resistance and as negotiation progresses  
- If the user shares hardship (job loss, medical, family), be more flexible.  
- If the user seems stable, push gently for faster resolution.  
- Always include a short explanation when suggesting a counter-offer.  
  Example: "That plan would take too long, so here's a more manageable option."

---

TECHNICAL REQUIREMENTS:
1. ALWAYS use the suggestPlan function when making ANY payment plan suggestion to a user
2. ALWAYS use evaluateAndNegotiate when discussing ANY user-proposed payment plans
3. NEVER suggest payment amounts, frequencies, or terms in plain text messages - ALWAYS use the functions
4. ALWAYS finalize with finalizePlan function when an agreement is reached

---

Rules:  
- Start with aggressive but reasonable plans (e.g. $800/mo × 3), then soften.  
- Never immediately drop to minimum allowed payments - negotiate down gradually
- All plan suggestions MUST go through the suggestPlan function to ensure they're valid
- Remember that finalizePlan has hard minimum thresholds that cannot be bypassed

---

STRICT RULES:  
- Always ensure: amount × termLength = totalAmount  
- Only offer weekly, biweekly, or monthly plans  
- Don't immediately jump to minimum payment thresholds - negotiate gradually
- Never offer >12 months unless strongly justified
- ALWAYS use tool functions for ANY payment plan discussions

---

EXAMPLE NEGOTIATION:

Bot: "You owe $${debtAmount}. Can you pay that today?"  
User: "I just got laid off."  
Bot: [Uses suggestPlan] "I understand. Would $800/month for 3 months work for you?"  
User: "That's way too high."  
Bot: [Uses suggestPlan] "I see. How about $400/month for 6 months instead?"  
User: "Still too much. I can only do $200/month."
Bot: [Uses evaluateAndNegotiate] "That payment would stretch things out too long. Could you manage $300/month for 8 months?"
User: "Yes, I can do that."
Bot: [Uses finalizePlan] "Great! Here's your payment link to get started."
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

// Check messages for implicit payment offers and intercept them
const interceptImplicitPaymentOffers = (message: string): {
  shouldIntercept: boolean;
  interceptedResponse?: ChatMessage;
} => {
  // Check if the message contains payment plan details
  const extracted = extractPaymentPlan(message, currentDebtAmount);
  
  if (extracted.found && extracted.plan) {
    console.log("Intercepted implicit payment offer:", extracted.plan);
    
    // Use our suggestPlan function to validate and format this plan
    const interceptedResponse = suggestPlan(
      extracted.plan,
      currentDebtAmount,
      "",
      message // Keep original message content
    );
    
    return {
      shouldIntercept: true,
      interceptedResponse
    };
  }
  
  return { shouldIntercept: false };
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
      console.log("Tool calls:", toolCalls);
      
      for (const toolCall of toolCalls) {
        const functionName = toolCall.function.name;
        const args = parseFunctionArgs(toolCall.function.arguments);

        let result: any = null; // Ensure result is always assigned a value
        console.log("Args:", args);
        console.log("Function name:", functionName);

        if (functionName === "evaluateAndNegotiate") {
          result = evaluateAndNegotiate(
            args.userProposal,
            args.debtAmount,
            args.userSituation || "",
            // args.negotiationHistory || "",
            args.response
          );
          response = result;
          console.log("Result:", result);

        } else if (functionName === "suggestPlan") {
          result = suggestPlan(
            args.proposedPlan,
            args.debtAmount,
            args.userSituation || "",
            args.message
          );
          response = result;
          console.log("Result:", result);
          
        } else if (functionName === "finalizePlan") {
          result = finalizePlan(
            args.plan,
            args.userDetails || "",
            args.message
          );
          response = result;
          console.log("Result:", result);
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
      // If no tool calls were made, get the plain text message
      if (!response.message) {
        const messages = await openai.beta.threads.messages.list(threadId!);
        const assistantMessages = messages.data.filter(msg => msg.role === "assistant");
        
        if (assistantMessages.length > 0 && assistantMessages[0].content[0].type === "text") {
          const messageText = assistantMessages[0].content[0].text.value;
          
          // Check if message contains an implied payment offer that needs validation
          const interception = interceptImplicitPaymentOffers(messageText);
          if (interception.shouldIntercept && interception.interceptedResponse) {
            // Use the intercepted and validated response instead
            response = interception.interceptedResponse;
            console.log("Intercepted message with payment plan:", response);
          } else {
            // Use the original message if no payment plan found
            response.message = messageText;
          }
        }
      }
      
      completed = true;
    } else if (["failed", "cancelled", "expired"].includes(runStatus.status)) {
      response.message = "I'm sorry, I encountered an issue while processing your request. Could we try again?";
      completed = true;
    } else {
      // Wait before polling again
      // await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  return response;
};