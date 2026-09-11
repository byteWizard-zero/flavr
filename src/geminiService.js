/**
 * FreeLLMAPI Proxy Service for Flavr
 * Routes requests to the OpenAI-compatible FreeLLMAPI proxy hosted on Render:
 * https://my-freellmapi-proxy.onrender.com/v1/chat/completions
 */

const DEFAULT_PROXY_BASE = 'https://my-freellmapi-proxy.onrender.com/v1';
const DEFAULT_UNIFIED_KEY = 'freellmapi-6c693465337e36eae695139f44da8dec2ae5f10389be9471';

/**
 * Normalizes proxy base URL or full endpoint URL to ensure valid chat completion endpoint.
 */
function getProxyEndpoint(rawUrl) {
  const base = (rawUrl || DEFAULT_PROXY_BASE).trim().replace(/\/+$/, '');
  if (base.endsWith('/chat/completions')) {
    return base;
  }
  if (base.endsWith('/v1')) {
    return `${base}/chat/completions`;
  }
  return `${base}/v1/chat/completions`;
}

/**
 * Robust JSON parser that handles:
 * - Direct raw JSON strings
 * - Fenced JSON blocks (```json ... ``` or ``` ... ```)
 * - Reasoning / CoT blocks (<think>...</think>)
 * - Preamble or trailing conversational text
 */
function parseJSONResponse(text) {
  if (!text || typeof text !== 'string') {
    throw new Error('Received empty or invalid text response from AI proxy.');
  }

  // 1. Strip reasoning blocks like <think>...</think> produced by deep-thinking models
  let cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

  // 2. Attempt direct parse
  try {
    return JSON.parse(cleaned);
  } catch {
    // Continue to pattern extraction
  }

  // 3. Extract JSON inside markdown code fence
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch && fenceMatch[1]) {
    try {
      return JSON.parse(fenceMatch[1].trim());
    } catch {
      // Continue
    }
  }

  // 4. Extract first balanced or bracketed JSON object
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const candidate = cleaned.slice(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(candidate);
    } catch {
      // Continue
    }
  }

  throw new Error('Could not parse culinary recipe response as valid JSON.');
}

/**
 * Validates and normalizes recipes to ensure UI components don't encounter undefined errors.
 */
function normalizeRecipeData(data) {
  const sanityCheck = {
    isValidCombination: data?.sanityCheck?.isValidCombination !== false,
    confidenceScore: typeof data?.sanityCheck?.confidenceScore === 'number' ? data.sanityCheck.confidenceScore : 1.0,
    nudgeMessage: data?.sanityCheck?.nudgeMessage || ''
  };

  const rawRecipes = Array.isArray(data?.recipes) ? data.recipes : [];
  const recipes = rawRecipes.map((recipe, index) => ({
    id: recipe.id || `recipe-${Date.now()}-${index}`,
    name: recipe.name || 'Untitled Culinary Dish',
    cuisine: recipe.cuisine || 'Fusion',
    cookTime: recipe.cookTime || '20 mins',
    difficulty: recipe.difficulty || 'Easy',
    description: recipe.description || 'A delicious dish crafted with your kitchen ingredients.',
    matchedIngredients: Array.isArray(recipe.matchedIngredients) ? recipe.matchedIngredients : [],
    missingIngredients: Array.isArray(recipe.missingIngredients) ? recipe.missingIngredients : [],
    nutritionalHighlights: {
      calories: recipe.nutritionalHighlights?.calories || 'approx 350 kcal',
      protein: recipe.nutritionalHighlights?.protein || 'approx 15g'
    },
    substitutionTips: Array.isArray(recipe.substitutionTips) ? recipe.substitutionTips : [],
    instructions: Array.isArray(recipe.instructions) ? recipe.instructions : ['Prepare ingredients and cook to taste.']
  }));

  return { sanityCheck, recipes };
}

/**
 * Sends ingredients to FreeLLMAPI proxy on Render to get ranked, beginner-friendly recipes.
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
    preferenceInstructions += `\nMEAL TYPE: All recipes generated must be ideal for ${mealType} (adjust portions, style, and cooking style accordingly).`;
  }

  const prompt = `
You are an expert culinary chef who specializes in helping absolute beginners cook delicious meals with whatever ingredients they have in their kitchen.

Phase 1 (Sanity Check): Evaluate if the ingredients can actually make a real, edible dish. Check for low-utility combinations or junk inputs.
Phase 2 (Recipe Generation): If valid, generate 3 to 5 realistic recipes ranked by how well the provided ingredients match, conforming strictly to any dietary or meal preferences.
${preferenceInstructions}

CRITICAL INSTRUCTION FOR BEGINNERS: For the step-by-step cooking instructions, do not assume any prior kitchen knowledge. Explain HOW to do a technique if necessary, include explicit visual or sensory cues (e.g., "cook until the onions turn translucent and soft, about 5 minutes", "it should smell fragrant"), and give helpful, clear safety or execution tips for each step.

Available Ingredients: [${ingredientsList.join(', ')}]

You MUST respond strictly using the following JSON schema format without markdown fences or conversational filler text:
{
  "sanityCheck": {
    "isValidCombination": true,
    "confidenceScore": 0.95,
    "nudgeMessage": ""
  },
  "recipes": [
    {
      "id": "1",
      "name": "Name of the dish",
      "cuisine": "Cuisine type",
      "cookTime": "Estimated total time (e.g., 25 mins)",
      "difficulty": "Easy",
      "description": "A short, appetizing text description of the dish.",
      "matchedIngredients": ["ingredient from list used"],
      "missingIngredients": ["minimal extra everyday items needed, shown clearly"],
      "nutritionalHighlights": {
        "calories": "approx 350 kcal",
        "protein": "approx 15g"
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
`.trim();

  const rawProxyUrl = import.meta.env?.VITE_FREELLMAPI_URL || 
                      import.meta.env?.VITE_BASE_URL || 
                      import.meta.env?.VITE_API_BASE_URL ||
                      DEFAULT_PROXY_BASE;

  const proxyUrl = getProxyEndpoint(rawProxyUrl);

  const proxyKey = import.meta.env?.VITE_OPENAI_API_KEY || 
                   import.meta.env?.VITE_FREELLMAPI_KEY || 
                   DEFAULT_UNIFIED_KEY;

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${proxyKey.trim()}`
  };

  const requestBody = {
    model: 'auto',
    messages: [
      {
        role: 'system',
        content: 'You are a professional chef API engine that outputs strictly valid JSON only.'
      },
      {
        role: 'user',
        content: prompt
      }
    ]
  };

  try {
    const response = await fetch(proxyUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errText = await response.text();
      let parsedErr = errText;
      try {
        const jsonErr = JSON.parse(errText);
        parsedErr = jsonErr.error?.message || jsonErr.message || errText;
      } catch {
        // use raw text
      }
      throw new Error(`FreeLLMAPI proxy error (${response.status}): ${parsedErr}`);
    }

    const data = await response.json();
    const responseText = data.choices?.[0]?.message?.content || data.content;
    if (!responseText) {
      throw new Error('FreeLLMAPI proxy returned an empty response.');
    }

    const parsedData = parseJSONResponse(responseText);
    return normalizeRecipeData(parsedData);
  } catch (proxyError) {
    console.error('FreeLLMAPI proxy call failed:', proxyError);
    throw new Error(proxyError.message || 'Failed to generate recipes from FreeLLMAPI proxy.', { cause: proxyError });
  }
}