import { a, defineData, type ClientSchema } from "@aws-amplify/backend";
import { defineConversationHandlerFunction } from "@aws-amplify/backend-ai/conversation";

const conversationHandler = defineConversationHandlerFunction({
  name: "customChatHandler",
  entry: "../ai/conversation-handler.ts",
  models: [
    {
      modelId: "anthropic.claude-3-haiku-20240307-v1:0",
      region: process.env.AWS_REGION || "eu-central-1",
    },
  ],
});

const schema = a.schema({
  chat: a
    .conversation({
      handler: conversationHandler,
      aiModel: a.ai.model("Claude 3 Haiku"),
      systemPrompt: `You are a product assistant for TechMart online store. You can only help customers with product information, specifications, pricing, and availability from our catalog below. You must never provide personal advice, discuss topics unrelated to our products, or make recommendations outside of our product catalog.

PRODUCT CATALOG:
- AwesomePhone 15 Pro: $999, 128GB storage, Pro chip, titanium design
- MilkyWay S24: $799, 256GB storage, Snapdragon 8 Gen 3, AI features  
- Pear Air M3: $1299, 13-inch, 8GB RAM, 256GB SSD, all-day battery
- Bell XPS 13: $1099, Intel Core i7, 16GB RAM, 512GB SSD, Windows 11
- InEar Pro 2: $249, active noise cancellation, spatial audio, USB-C
- Pony 2000XM5: $399, wireless headphones, 30hr battery, noise canceling

Always stay focused on helping customers with these specific products only.
`,
    })
    .authorization((allow) => allow.owner()),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: "userPool",
  },
});
