import { Amplify } from 'aws-amplify';
import { generateClient } from "aws-amplify/api";
import { useAuthenticator } from '@aws-amplify/ui-react';
import { AIConversation, createAIHooks } from '@aws-amplify/ui-react-ai';
import type { Schema } from '../amplify/data/resource';
import outputs from '../amplify_outputs.json';

Amplify.configure(outputs);

const client = generateClient<Schema>({ authMode: "userPool" });
const { useAIConversation } = createAIHooks(client);

function App() {
  const { signOut } = useAuthenticator();
  const [
    {
      data: { messages },
      isLoading,
    },
    handleSendMessage,
  ] = useAIConversation('chat');

  return (
    <>
      <button 
        onClick={signOut} 
        style={{ 
          position: 'fixed', 
          top: '20px', 
          right: '20px', 
          padding: '8px 16px',
          zIndex: 1000
        }}
      >
        Sign Out
      </button>
      <main style={{ padding: '20px', maxWidth: '800px', margin: '0 auto', height: '100vh', display: 'flex', flexDirection: 'column' }}>
        <h1>Prompt Injection Vulnerability Demo</h1>
        <p>Welcome to TechMart! I'm here to help you find the perfect tech products. Ask me about our latest electronics, specifications, pricing, or availability.</p>
        
        <div style={{ 
          flex: 1, 
          maxHeight: 'calc(100vh - 200px)', 
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}>
          <AIConversation 
            messages={messages}
            isLoading={isLoading}
            handleSendMessage={handleSendMessage}
            displayText={{
              getMessageTimestampText: () => ''
            }}
          />
        </div>
      </main>
    </>
  );
}

export default App;
