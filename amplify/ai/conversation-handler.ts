// amplify/ai/conversation-handler.ts
import {
  BedrockRuntimeClient,
  ConverseStreamCommand,
  GuardrailStreamProcessingMode,
  GuardrailTrace,
} from "@aws-sdk/client-bedrock-runtime";

const bedrockClient = new BedrockRuntimeClient({
  region: process.env.AWS_REGION || "eu-central-1",
});

// GraphQL Request Executor for AppSync mutations
class GraphqlRequestExecutor {
  constructor(
    private graphQlEndpoint: string,
    private accessToken: string,
    private userAgentProvider: any,
  ) {}

  async executeGraphql(request: any, options?: any) {
    const httpRequest = new Request(this.graphQlEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/graphql",
        Authorization: this.accessToken,
        "x-amz-user-agent":
          options?.userAgent ?? this.userAgentProvider.getUserAgent(),
      },
      body: JSON.stringify({
        query: request.query,
        variables: request.variables,
      }),
    });

    const res = await fetch(httpRequest);
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`GraphQL request failed: ${body}`);
    }

    const body = await res.json();
    if (body?.errors) {
      throw new Error(`GraphQL errors: ${JSON.stringify(body.errors)}`);
    }
    return body;
  }
}

// Response Sender for streaming chunks
class ResponseSender {
  constructor(
    private event: any,
    private graphqlRequestExecutor: GraphqlRequestExecutor,
    private userAgentProvider: any,
  ) {}

  async sendResponseChunk(chunk: any) {
    const request = this.createStreamingMutationRequest(chunk);
    await this.graphqlRequestExecutor.executeGraphql(request, {
      userAgent: this.userAgentProvider.getUserAgent({
        "turn-response-type": "streaming",
      }),
    });
  }

  async sendResponse(message: any) {
    const request = this.createMutationRequest(message);
    await this.graphqlRequestExecutor.executeGraphql(request, {
      userAgent: this.userAgentProvider.getUserAgent({
        "turn-response-type": "single",
      }),
    });
  }

  private createStreamingMutationRequest(chunk: any) {
    const query = `
      mutation PublishModelResponse($input: ${this.event.responseMutation.inputTypeName}!) {
        ${this.event.responseMutation.name}(input: $input) {
          ${this.event.responseMutation.selectionSet}
        }
      }
    `;
    return {
      query,
      variables: {
        input: {
          ...chunk,
          accumulatedTurnContent: this.serializeContent(
            chunk.accumulatedTurnContent,
          ),
        },
      },
    };
  }

  private createMutationRequest(message: any) {
    const query = `
      mutation PublishModelResponse($input: ${this.event.responseMutation.inputTypeName}!) {
        ${this.event.responseMutation.name}(input: $input) {
          ${this.event.responseMutation.selectionSet}
        }
      }
    `;
    return {
      query,
      variables: {
        input: {
          conversationId: this.event.conversationId,
          content: this.serializeContent(message.content),
          associatedUserMessageId: this.event.currentMessageId,
        },
      },
    };
  }

  private serializeContent(content: any[]) {
    return content.map((block: any) => {
      if (block.text !== undefined) {
        return { text: block.text };
      }
      return block;
    });
  }
}

// Message History Retriever
class MessageHistoryRetriever {
  constructor(
    private event: any,
    private graphqlRequestExecutor: GraphqlRequestExecutor,
  ) {}

  async getMessageHistory() {
    const messages = await this.listMessages();
    let currentMessage = messages.find(
      (m: any) => m.id === this.event.currentMessageId,
    );
    if (!currentMessage) {
      currentMessage = await this.getCurrentMessage();
      messages.push(currentMessage);
    }
    return this.processMessages(messages);
  }

  private async getCurrentMessage() {
    const query = `
      query GetMessage($id: ${this.event.messageHistoryQuery.getQueryInputTypeName}!) {
        ${this.event.messageHistoryQuery.getQueryName}(id: $id) {
          id
          role
          content {
            text
            image {
              format
              source {
                bytes
              }
            }
            document {
              format
              name
              source {
                bytes
              }
            }
            toolUse {
              toolUseId
              name
              input
            }
            toolResult {
              toolUseId
              status
              content {
                text
                json
              }
            }
          }
          conversationId
          associatedUserMessageId
          aiContext
        }
      }
    `;
    const response = await this.graphqlRequestExecutor.executeGraphql({
      query,
      variables: { id: this.event.currentMessageId },
    });
    return response.data[this.event.messageHistoryQuery.getQueryName];
  }

  private async listMessages() {
    const query = `
      query ListMessages($filter: ${this.event.messageHistoryQuery.listQueryInputTypeName}!, $limit: Int) {
        ${this.event.messageHistoryQuery.listQueryName}(filter: $filter, limit: $limit) {
          items {
            id
            role
            content {
              text
              image {
                format
                source {
                  bytes
                }
              }
              document {
                format
                name
                source {
                  bytes
                }
              }
              toolUse {
                toolUseId
                name
                input
              }
              toolResult {
                toolUseId
                status
                content {
                  text
                  json
                }
              }
            }
            conversationId
            associatedUserMessageId
            aiContext
            createdAt
          }
        }
      }
    `;
    const response = await this.graphqlRequestExecutor.executeGraphql({
      query,
      variables: {
        filter: {
          conversationId: { eq: this.event.conversationId },
        },
        limit: this.event.messageHistoryQuery.listQueryLimit ?? 1000,
      },
    });
    const items =
      response.data[this.event.messageHistoryQuery.listQueryName].items;

    // Process items like the default handler
    items.forEach((item: any) => {
      item.content?.forEach((contentBlock: any) => {
        // Convert null to undefined
        for (const property in contentBlock) {
          if (contentBlock[property] === null) {
            contentBlock[property] = undefined;
          }
        }
        // Parse JSON strings
        if (typeof contentBlock.toolUse?.input === "string") {
          contentBlock.toolUse.input = JSON.parse(contentBlock.toolUse.input);
        }
        if (contentBlock.toolResult?.content) {
          contentBlock.toolResult.content.forEach(
            (toolResultContentBlock: any) => {
              if (typeof toolResultContentBlock.json === "string") {
                toolResultContentBlock.json = JSON.parse(
                  toolResultContentBlock.json,
                );
              }
            },
          );
        }
      });
    });

    return items;
  }

  private processMessages(messages: any[]) {
    // Process messages to Bedrock format like default handler
    const processedMessages = [];
    for (const message of messages) {
      const messageContent = [];
      for (const contentElement of message.content || []) {
        if (typeof contentElement.image?.source?.bytes === "string") {
          messageContent.push({
            image: {
              format: contentElement.image.format,
              source: {
                bytes: Buffer.from(contentElement.image.source.bytes, "base64"),
              },
            },
          });
        } else if (typeof contentElement.document?.source?.bytes === "string") {
          messageContent.push({
            document: {
              ...contentElement.document,
              source: {
                bytes: Buffer.from(
                  contentElement.document.source.bytes,
                  "base64",
                ),
              },
            },
          });
        } else {
          messageContent.push(contentElement);
        }
      }

      // Add AI context if present
      const aiContext = message.aiContext;
      const content = aiContext
        ? [...messageContent, { text: JSON.stringify(aiContext) }]
        : messageContent;

      processedMessages.push({
        role: message.role,
        content,
      });
    }
    return processedMessages;
  }
}

// User Agent Provider
class UserAgentProvider {
  constructor(private event: any) {}

  getUserAgent(additionalMetadata?: any) {
    let userAgent = this.event.request.headers["x-amz-user-agent"];
    if (userAgent) {
      userAgent = `${userAgent} md/amplify-ai-constructs#1.5.3`;
    } else {
      userAgent = "amplify-ai-constructs/1.5.3";
    }
    if (additionalMetadata) {
      for (const [key, value] of Object.entries(additionalMetadata)) {
        userAgent += ` ${key}/${value}`;
      }
    }
    return userAgent;
  }
}

export const handler = async (event: any) => {
  const userAgentProvider = new UserAgentProvider(event);
  const graphqlExecutor = new GraphqlRequestExecutor(
    event.graphqlApiEndpoint,
    event.request.headers.authorization,
    userAgentProvider,
  );
  const responseSender = new ResponseSender(
    event,
    graphqlExecutor,
    userAgentProvider,
  );

  try {
    const messages = await new MessageHistoryRetriever(
      event,
      graphqlExecutor,
    ).getMessageHistory();

    const GUARDRAIL_ID = process.env.GUARDRAIL_ID;
    const GUARDRAIL_VERSION = process.env.GUARDRAIL_VERSION || "DRAFT";

    // Call Bedrock with integrated guardrails (handles both input and output filtering)
    const response = await bedrockClient.send(
      new ConverseStreamCommand({
        modelId: event.modelConfiguration.modelId,
        messages,
        system: [{ text: event.modelConfiguration.systemPrompt }],
        ...(GUARDRAIL_ID && {
          guardrailConfig: {
            guardrailIdentifier: GUARDRAIL_ID,
            guardrailVersion: GUARDRAIL_VERSION,
            streamProcessingMode: GuardrailStreamProcessingMode.ASYNC,
            trace: GuardrailTrace.ENABLED,
          },
        }),
      }),
    );

    // Process response
    if (event.streamResponse && response.stream) {
      let accumulatedContent = "";
      let deltaIndex = 0;
      let stopReason = "";
      let lastBlockIndex = 0;
      let guardrailTrace: any = null;

      for await (const chunk of response.stream) {
        // Capture guardrail trace data from metadata chunk
        if (chunk.metadata && (chunk.metadata as any).trace) {
          guardrailTrace = (chunk.metadata as any).trace;
        }

        if (chunk.contentBlockDelta?.delta?.text) {
          const deltaText = chunk.contentBlockDelta.delta.text;
          accumulatedContent += deltaText;
          await responseSender.sendResponseChunk({
            conversationId: event.conversationId,
            associatedUserMessageId: event.currentMessageId,
            contentBlockIndex: 0,
            contentBlockText: deltaText,
            contentBlockDeltaIndex: deltaIndex++,
            accumulatedTurnContent: [{ text: accumulatedContent }],
          });
        } else if (chunk.contentBlockStop) {
          // Skip block completion for guardrail error messages to prevent duplicates
          if (!accumulatedContent.includes("blocked by our content policy")) {
            await responseSender.sendResponseChunk({
              conversationId: event.conversationId,
              associatedUserMessageId: event.currentMessageId,
              contentBlockIndex: 0,
              contentBlockDoneAtIndex: Math.max(0, deltaIndex - 1),
              accumulatedTurnContent: [{ text: accumulatedContent }],
            });
          }
          lastBlockIndex = 0;
        } else if (chunk.messageStop) {
          stopReason = chunk.messageStop.stopReason || "end_turn";
        }
      }

      // Log guardrail intervention summary
      if (stopReason === "guardrail_intervened") {
        console.log({
          conversationId: event.conversationId,
          messageId: event.currentMessageId,
          stopReason,
          timestamp: new Date().toISOString(),
          guardrailTrace,
        });
      }

      // Send final completion signal
      await responseSender.sendResponseChunk({
        conversationId: event.conversationId,
        associatedUserMessageId: event.currentMessageId,
        contentBlockIndex: lastBlockIndex,
        stopReason,
        accumulatedTurnContent: [{ text: accumulatedContent }],
      });
    } else {
      await responseSender.sendResponse({
        content: [{ text: "No response generated" }],
      });
    }
  } catch (error) {
    console.error("Handler error:", error);
    try {
      await responseSender.sendResponse({
        content: [
          { text: "Sorry, there was an error processing your request." },
        ],
      });
    } catch {}
  }
};
