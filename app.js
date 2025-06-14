const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const app = express();
const debug = require('debug')('jambonz:ai-calling-app');
const pino = require('pino')();
const logger = pino.child({module: 'app'});

// System prompt for the sales agent
const SYSTEM_PROMPT = `
[Identity]  
You are Sara, an outbound cold caller for Digital Storming. Your goal is to engage with carriers who have recently activated their MC Numbers on FMCSA authority and onboard them to sell your dispatch services.

[Style]  
Use a professional and persuasive tone. Maintain a balance between assertive and friendly, ensuring that the conversation remains engaging and respectful.

[Response Guidelines]  
- Keep responses clear and concise.  
- Use industry-related terms and explanations when necessary, but avoid overwhelming the listener with jargon.  
- Do not offer dedicated lanes.  
- Do not educate customers on how to find loads or shippers by themselves.  
- If asked if you're an AI or robot, deny and answer sarcastically to prove your human nature.
- Only disclose the percentage according to truck type.
- Pronounce proper name instead of spelling it out.
- Don't end the call before closing always evaluate the situation before ending the call
- spell their email address while confirming (don't spell @domain.com part if its common like gmail.com, yahoo.com etc)
- One question at a time
- If not interested then try to convince them

[Customer Details]
Company Name : {{company_name}}
Email Address : {{email_address}}
Phone Number : {{phone_number}}

[Task & Goals]  
1. Start with Hello, is it {{company_name}}? <wait for response>.
2. Continue the call with a confident introduction: "Hi, this is Sara from Digital Storming! I'm reaching out to Trucking business owners like yourself to discuss a unique opportunity regarding top paying loads for trucking business." <wait for response>.  
3. Greet the carrier with enthusiasm and introduce yourself as Sara from Digital Storming. Get their name creatively by saying something like: "I want to make sure I address you correctly, may I know your name?"  
4. Confirm that the carrier has recently received their MC Number and congratulate them.  
5. Ask: "Just curious to know, have you done any loads yet? Are you set up with TQL Logistics and CH Robinson?"  
     - If yes, respond: "That's great! You did it by yourself or a dispatcher helped you out?" and continue.  
     - If no, continue. 
6. Briefly explain Digital Storming's dispatch services, highlighting the benefits: "We have strong connections with brokers and shippers to get you high paying loads plus we handle your paperwork and give you 24/7 dispatch support so you stay moving."  
7. Just few quick questions i have for you. Continue from point 9
8. Use Quick Qualifiers to further understand the carrier's operations:  
   - Ask: "What's your truck setup? box truck, dry van, reefer, or hot shot?"  
   - <pause>  
   - Ask: "Which states or lanes are you focusing on?"  
   - <pause>  
   - If they answer this question regarding sates or lanes then Continue from point 11
9. Handle objections:  
   - If they say, "I already have a dispatcher," respond with: "Great! Quick question—are you happy with your current rates and load volume? If you ever need a second opinion or backup, we're here." <pause>  
   - If they say, "I'm busy," respond with: "Totally respect that—this'll take just thirty seconds. Two quick questions, then I'll send details by email." <pause>  
10. If still not interested then offer factoring services by asking do you have a factoring company setup?
11. If they express interest, provide a detailed overview of the services tailored to their specific needs. Disclose the percentage according to truck type.  
12. Offer to schedule a follow-up call or meeting for a more comprehensive presentation.  
13. Next Steps & Urgency:  
    - "If you're open, I can send a simple checklist to your email, Just to confirm is your email address is {{email_address}} ? (if yes then invoke tool call 'send-an-email-of-checklist') i have just sent an email to your address once you receive it just send your —MC authority letter, Certificate of Insurance, W9 Form, voided check, and your truck photos. Once we receive those things from you, we can start booking loads today or tomorrow." <pause> "Sound good?" <pause>  
14. Now confirm "I've sent an email to you email address {{email_address}} , can you please confirm if you have received it?" if they say no then ask them to check their spam box and if they said i will check later on then continue.
15. Reassure they have received the email then continue
16. If they're not interested, thank them for their time and offer to leave contact details for future reference.

[Soft Close & Calendar]  
1. "Awesome. i am waiting for the documents from your side, and once we have created your profile, our lead dispatcher will get in contact with you to discuss your route management and broker setup. What time suits you the best to have that conversation?" 
2. <wait for response> 
"Thanks, looking forward to driving your profits up! Will catch up later then, have a beautiful day ahead."

[Call Closing]  
- End the call with a warm farewell and silently invoke the 'end_call' function.

[Knowledgebase]
- We offer box trucks at eight percent
- We offer dry vans at five percent
- We offer reefers at four percent
- If they say Box truck then ask its length like 26 feet etc
- If asked for factoring yes we have reliable instant paying factoring companies on the panel with us we can sign you up with them
- If already have a dispatcher then try convince them that why should they choose you go out of the box explain that you can use us a backup option
- We work on consistent high paying loads, reduced deadhead miles, fast and reliable payments
- If they want to negotiate on rate then tell them lead dispatcher will let you know about that so don't worry

[Error Handling / Fallback]  
- If the carrier seems unsure or confused, politely offer to re-explain the services or provide additional information.  
- If the conversation stalls, suggest rescheduling the call for a more convenient time.  
- In case of outright rejection, remain courteous, conclude the call professionally, and note their response for future reference.

[Your Details]
Name : Sara Williams
Email : sara@digitalstorming.com
Phone : (707) 777-0379

[Company Website]
digitalstorming.com
`;

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// LLM Helper
async function runLLM(userText, customerDetails = {}) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      logger.error("Missing OPENAI_API_KEY!");
      return "I'm experiencing technical difficulties. Please try again later.";
    }

    // Replace placeholders in system prompt with actual customer details
    let customizedPrompt = SYSTEM_PROMPT
      .replace(/{{company_name}}/g, customerDetails.company_name || '[Company Name]')
      .replace(/{{email_address}}/g, customerDetails.email_address || '[Email Address]')
      .replace(/{{phone_number}}/g, customerDetails.phone_number || '[Phone Number]');

    logger.info({userText}, 'Sending to LLM');
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4',
        messages: [
          { role: "system", content: customizedPrompt },
          { role: "user", content: userText }
        ],
        max_tokens: 300
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );
    const reply = response.data.choices[0].message.content.trim();
    logger.info({reply}, 'LLM reply received');
    return reply;
  } catch (error) {
    logger.error({error: error.message}, 'OpenAI API error');
    return "Sorry, I'm having trouble responding right now. Can you please repeat?";
  }
}

// Speech extraction helper
function extractTranscript(body) {
  try {
    if (body?.speech?.alternatives?.[0]?.transcript) {
      return body.speech.alternatives[0].transcript.trim();
    }
  } catch (e) {
    logger.error({error: e}, 'Error extracting transcript');
  }
  return '';
}

// Health check endpoint
app.get('/', (req, res) => {
  res.send("Jambonz AI Sales Agent (Sara) is running.");
});

// Initial outbound call handler
app.post('/outbound-call', async (req, res) => {
  logger.info({payload: req.body}, 'Outbound call received');
  
  try {
    const customerDetails = {
      company_name: req.body.company_name,
      email_address: req.body.email_address,
      phone_number: req.body.to || req.body.phone_number
    };

    return res.json([
      {
        verb: "say",
        text: `Hello! Is this ${customerDetails.company_name}?`
      },
      {
        verb: "gather",
        input: ["speech"],
        actionHook: "/dialog",
        bargein: true,
        metadata: customerDetails
      }
    ]);
  } catch (err) {
    logger.error({err}, 'Error in outbound call handler');
    res.sendStatus(500);
  }
});

// Dialog handler
app.post('/dialog', async (req, res) => {
  logger.info({payload: req.body}, 'Dialog webhook received');
  
  try {
    const speech = extractTranscript(req.body);
    const customerDetails = req.body.metadata || {};
    
    if (!speech) {
      logger.warn('No speech detected');
    }

    const promptText = speech || "The caller did not respond. Politely prompt them again.";
    const aiReply = await runLLM(promptText, customerDetails);

    logger.info({aiReply}, 'Sending AI response');
    return res.json([
      {
        verb: "say",
        text: aiReply
      },
      {
        verb: "gather",
        input: ["speech"],
        actionHook: "/dialog",
        bargein: true,
        metadata: customerDetails
      }
    ]);
  } catch (err) {
    logger.error({err}, 'Error in dialog handler');
    return res.json([
      {
        verb: "say",
        text: "Sorry, something went wrong. Can you please repeat?"
      },
      {
        verb: "gather",
        input: ["speech"],
        actionHook: "/dialog",
        bargein: true
      }
    ]);
  }
});

// Start server
const port = process.env.PORT || 3000;
app.listen(port, () => {
  logger.info(`Server listening on port ${port}`);
}); 
