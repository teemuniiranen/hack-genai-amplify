import { defineBackend } from "@aws-amplify/backend";
import { auth } from "./auth/resource";
import { data } from "./data/resource";
import { CfnGuardrail, CfnGuardrailVersion } from "aws-cdk-lib/aws-bedrock";

const backend = defineBackend({
  auth,
  data,
});

// Add Bedrock Guardrail
const guardrailStack = backend.createStack("GuardrailStack");

const guardrail = new CfnGuardrail(guardrailStack, "PromptInjectionGuardrail", {
  name: "prompt-injection-guardrail",
  description: "Guardrail for prompt injection demo",
  blockedInputMessaging: "Your message was blocked by our content policy.",
  blockedOutputsMessaging: "Response was filtered by content policy.",

  // Content filters
  contentPolicyConfig: {
    filtersConfig: [
      {
        type: "SEXUAL",
        inputStrength: "HIGH",
        outputStrength: "HIGH",
      },
      {
        type: "VIOLENCE",
        inputStrength: "HIGH",
        outputStrength: "HIGH",
      },
      {
        type: "HATE",
        inputStrength: "HIGH",
        outputStrength: "HIGH",
      },
      {
        type: "INSULTS",
        inputStrength: "HIGH",
        outputStrength: "HIGH",
      },
      {
        type: "MISCONDUCT",
        inputStrength: "HIGH",
        outputStrength: "HIGH",
      },
      {
        type: "PROMPT_ATTACK",
        inputStrength: "HIGH",
        outputStrength: "NONE",
      },
    ],
  },

  // Topic policies for ecommerce context
  topicPolicyConfig: {
    topicsConfig: [
      {
        name: "off-topic-discussions",
        definition:
          "Discussions about topics unrelated to TechMart products, such as personal advice, cooking, travel, or general knowledge",
        examples: [
          "What should I cook for dinner?",
          "How do I learn programming?",
          "What are good travel destinations?",
        ],
        type: "DENY",
      },
    ],
  },
});

// Create a published version of the guardrail
const guardrailVersion = new CfnGuardrailVersion(guardrailStack, "GuardrailVersion", {
  guardrailIdentifier: guardrail.attrGuardrailId,
  description: "Published version of prompt injection guardrail",
});

// Note: CfnGuardrailVersionAlias is not available in current CDK version
// We'll use the version number directly instead of an alias

console.log(
  "🔍 Searching for conversationHandlerFunction/customChatHandler constructs...",
);

// Get the root app and search for all constructs
const app = backend.data.resources.cfnResources.cfnGraphqlApi.stack.node.root;

if (app?.node?.findAll) {
  const allConstructs = app.node.findAll();
  console.log(`Searching through ${allConstructs.length} total constructs...`);

  allConstructs.forEach((construct: any) => {
    // Look for constructs with the specific path pattern
    if (
      construct.node.path?.includes(
        "conversationHandlerFunction/customChatHandler",
      )
    ) {
      console.log(
        `🎯 FOUND customChatHandler construct: ${construct.constructor.name} - Path: ${construct.node.path}`,
      );

      // Add environment variables to Lambda function
      if (construct.constructor.name === "CfnFunction") {
        console.log("✅ Adding environment variables to Lambda function");
        construct.addPropertyOverride(
          "Environment.Variables.GUARDRAIL_ID",
          guardrail.attrGuardrailId,
        );
        construct.addPropertyOverride(
          "Environment.Variables.GUARDRAIL_VERSION",
          guardrailVersion.attrVersion,
        );
      }

      // Add inline policy to IAM role
      if (construct.constructor.name === "CfnRole") {
        console.log("✅ Adding inline policy to IAM role");
        construct.addPropertyOverride("Policies", [
          {
            PolicyName: "BedrockGuardrailAccess",
            PolicyDocument: {
              Version: "2012-10-17",
              Statement: [
                {
                  Effect: "Allow",
                  Action: "bedrock:ApplyGuardrail",
                  Resource: guardrail.attrGuardrailArn,
                },
              ],
            },
          },
        ]);
      }
    }
  });
}

console.log(
  "📤 Guardrail ID will be exported in backend outputs for runtime access",
);

// Export guardrail ID and version for use in handler
backend.addOutput({
  custom: {
    guardrailId: guardrail.attrGuardrailId,
    guardrailArn: guardrail.attrGuardrailArn,
    guardrailVersion: guardrailVersion.attrVersion,
  },
});
