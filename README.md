## Prompt Injection Vulnerability Demo with GenAI

This application demonstrates prompt injection vulnerabilities in GenAI applications using AWS services. Built with React+Vite and AWS Amplify, it provides a chatbot interface for testing various prompt injection attack vectors.

## Overview

This project showcases potential security vulnerabilities in AI-powered applications, specifically focusing on prompt injection attacks. It uses Amazon Bedrock for foundation models and AWS Amplify AI Kit for rapid chatbot development, with plans to integrate Strand Agents for advanced agentic AI capabilities.

## Features

- **Authentication**: Secure user authentication with Amazon Cognito
- **AI Chatbot**: Interactive chat interface powered by AWS Amplify AI Kit
- **Amazon Bedrock Integration**: Uses Claude 3 Haiku model for AI responses
- **Prompt Injection Testing**: Platform for demonstrating various attack vectors
- **Future Integration**: Ready for Strand Agents implementation

## Getting Started

1. **Deploy the backend**:
   ```bash
   npx ampx sandbox
   ```

2. **Start the development server**:
   ```bash
   npm run dev
   ```

3. **Access the application**: Sign up/in to access the AI chatbot interface

## Testing Prompt Injections

Once deployed, you can test various prompt injection techniques through the chat interface to demonstrate vulnerabilities in GenAI applications.

## Deploying to AWS

For production deployment, refer to the [Amplify deployment documentation](https://docs.amplify.aws/react/start/quickstart/#deploy-a-fullstack-app-to-aws).

## Security

See [CONTRIBUTING](CONTRIBUTING.md#security-issue-notifications) for more information.

## License

This library is licensed under the MIT-0 License. See the LICENSE file.