import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * Normalizes proxy base URL or full endpoint URL to ensure valid chat completion endpoint.
 * Handles inputs like:
 * - "https://my-freellmapi-proxy.onrender.com/v1" -> "https://my-freellmapi-proxy.onrender.com/v1/chat/completions"
 * - "https://my-freellmapi-proxy.onrender.com" -> "https://my-freellmapi-proxy.onrender.com/v1/chat/completions"
 * - "https://my-freellmapi-proxy.onrender.com/v1/chat/completions" -> "https://my-freellmapi-proxy.onrender.com/v1/chat/completions"
 */
function getProxyEndpoint(rawUrl) {
  const defaultUrl = 'https://my-freellmapi-proxy.onrender.com/v1/chat/completions';
  if (!rawUrl) return defaultUrl;
  let url = rawUrl.trim().replace(/\/+$/, '');
  if (!url.endsWith('/chat/completions')) {
    if (url.endsWith('/v1')) {
      url += '/chat/completions';
    } else {
      url += '/v1/chat/completions';
    }
  }
  return url;
}

/**
 * Helper to safely extract JSON from LLM response text, stripped of markdown fences if present.
 */
function parseJSONResponse(text) {
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
  }
  return JSON.parse(cleaned);
}

/**
 * Sends ingredients to Gemini / FreeLLM proxy to get ranked, beginner-friendly recipes.
 * Uses Structured JSON Output to guarantee clean parsing.
 * @param {Array<string>} ingredientsList 
 * @param {Object} preferences
 * @returns {Promise<Object>} Formatted recipes or sanity check errors
 */
export async function generateRecipesFromPantry(ingredientsList, preferences = {}) {
  const { diet, mealType } = preferences;
  let preferenceInstructions = '';
  if (diet && diet !== 'none') {
    preferenceInstructions += `\nDIETARY RESTRICTION: You MUST only generate recipes that are strictly ${diet}. Ensure all ingredients, instructions, and substitutions conform to a ${diet} diet.`;
  }
  if (mealType && mealType !== 'none') {
    preferenceInstructions += `\nMEAL TYPE: All recipes generated must be ideal for ${mealType} (e.g. adjust portions, style, and ingredients accordingly).`;
  }

  const prompt = `
    You are an expert culinary chef who specializes in helping absolute beginners cook amazing meals with whatever ingredients they have in their kitchen.
    
    You will be given a list of available ingredients. Act in two logical phases combined into a single structured response:
    
    Phase 1 (Sanity Check): Evaluate if the ingredients can actually make a real, edible dish. Check for low-utility combinations or junk inputs.
    Phase 2 (Recipe Generation): If valid, generate 3 to 5 realistic recipes ranked by how well the provided ingredients match, conforming strictly to any dietary or meal preferences.
    ${preferenceInstructions}
    
    CRITICAL INSTRUCTION FOR BEGINNERS: For the step-by-step cooking instructions, do not assume any prior kitchen knowledge. Explain HOW to do a technique if necessary, include explicit visual or sensory cues (e.g., "cook until the onions turn translucent and soft, about 5 minutes", "it should smell fragrant"), and give helpful, clear safety or execution tips for each step.
    
    Available Ingredients: [${ingredientsList.join(', ')}]
    
    You MUST respond strictly using the following JSON schema format without any markdown wrappers or conversational filler text:
    {
      "sanityCheck": {
        "isValidCombination": true/false,
        "confidenceScore": 0.0 to 1.0,
        "nudgeMessage": "A soft suggestion string if a low-utility item like cabbage shouldn't be forced, or empty string"
      },
      "recipes": [
        {
          "id": "unique-string-or-number",
          "name": "Name of the dish",
          "cuisine": "Cuisine type",
          "cookTime": "Estimated total time (e.g., 25 mins)",
          "difficulty": "Easy / Medium / Hard",
          "description": "A short, appetizing text description of the dish.",
          "matchedIngredients": ["ingredient from list used"],
          "missingIngredients": ["minimal extra everyday items needed, shown clearly"],
          "nutritionalHighlights": {
            "calories": "approx calories",
            "protein": "approx protein content"
          },
          "substitutionTips": [
            "Tip for substituting a missing ingredient if they don't have it"
          ],
          "instructions": [
            "Detailed, beginner-reliant step 1 with visual/timing cues.",
            "Detailed, beginner-reliant step 2 with visual/timing cues."
          ]
        }
      ]
    }
  `;

  const geminiApiKey = import.meta.env.VITE_GEMINI_API_KEY;

  // 1. If VITE_GEMINI_API_KEY is explicitly set, attempt Direct Google Generative AI SDK call first
  if (geminiApiKey) {
    try {
      const genAI = new GoogleGenerativeAI(geminiApiKey);
      const model = genAI.getGenerativeModel({ 
        model: 'gemini-2.5-flash',
        generationConfig: { responseMimeType: 'application/json' }
      });
      
      const result = await Promise.race([
        model.generateContent(prompt),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Direct API call timed out after 5 seconds")), 5000))
      ]);

      const responseText = result.response.text();
      return parseJSONResponse(responseText);
    } catch (directError) {
      console.warn("Direct Gemini API failed, falling back to FreeLLMAPI proxy:", directError);
    }
  }

  // 2. Main / Fallback path: FreeLLMAPI Proxy Call
  try {
    const rawProxyUrl = import.meta.env.VITE_FREELLMAPI_URL || import.meta.env.VITE_BASE_URL || import.meta.env.VITE_API_BASE_URL;
    const proxyUrl = getProxyEndpoint(rawProxyUrl);
    
    const proxyKey = import.meta.env.VITE_OPENAI_API_KEY || 
                     import.meta.env.OPENAI_API_KEY || 
                     import.meta.env.VITE_FREELLMAPI_KEY || 
                     'freellmapi-6c693465337e36eae695139f44da8dec2ae5f10389be9471';

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${proxyKey}`
    };

    const response = await fetch(proxyUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: 'auto',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Proxy returned status ${response.status}: ${errText}`);
    }

    const data = await response.json();
    const responseText = data.choices?.[0]?.message?.content || data.content;
    if (!responseText) {
      throw new Error("Proxy returned empty response content.");
    }
    return parseJSONResponse(responseText);
  } catch (proxyError) {
    console.error("FreeLLMAPI proxy call failed:", proxyError);
    throw new Error("Failed to communicate with our culinary core. All provider connections failed.", { cause: proxyError });
  }
}