import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize the SDK using the secure Vite environment variable
const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey);

/**
 * Sends ingredients to Gemini 3 Flash to get ranked, beginner-friendly recipes.
 * Uses Structured JSON Output to guarantee clean parsing.
 * @param {Array<string>} ingredientsList 
 * @returns {Promise<Object>} Formatted recipes or sanity check errors
 */
export async function generateRecipesFromPantry(ingredientsList, preferences = {}) {
  try {
    const { diet, mealType } = preferences;
    // We utilize gemini-2.5-flash as it is lightning fast and keeps responses under 5 seconds
    const model = genAI.getGenerativeModel({ 
      model: 'gemini-2.5-flash',
      // Force the model to answer exclusively in valid JSON structure
      generationConfig: { responseMimeType: 'application/json' }
    });

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

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    
    // Safely parse the strict JSON returned by Gemini
    return JSON.parse(responseText);
  } catch (error) {
    console.error("Gemini API Orchestration Error:", error);
    throw new Error("Failed to communicate with our culinary core. Check your API key or network connection.", { cause: error });
  }
}