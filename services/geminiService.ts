
import { GoogleGenAI } from "@google/genai";
import { Student } from "../types";

const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  console.warn("API_KEY environment variable not set. AI features will be disabled.");
}

const ai = new GoogleGenAI({ apiKey: API_KEY! });

export const generateTeacherComment = async (student: Student, studentData: any, manualComment?: string): Promise<string> => {
  if (!API_KEY) {
    return "AI comment generation is disabled because the API key is not configured.";
  }
  
  const basePrompt = `
    You are a compassionate and encouraging Quran teacher. Based on the following progress data for a student named ${student.name}, please write a brief, positive, and constructive comment for their guardian.

    Data for the selected period:
    - Last Achievement (Reading): ${studentData.lastAchievementText}
    - Total Pages Read: ${studentData.totalPages}
    - Total Pages Memorized: ${studentData.totalMemorizedPages}
    - Average Reading Quality (out of 10): ${studentData.avgReadingQuality.toFixed(1)}
    - Average Memorization Quality (out of 10): ${studentData.avgMemorizationQuality.toFixed(1)}
    - Attendance: ${studentData.attendance.present} days present, ${studentData.attendance.absent} days absent, ${studentData.attendance.rescheduled} days rescheduled.
    - Tajweed Rules Mastered: ${student.masteredTajweedRules.join(', ') || 'None yet'}
  `;

  const instruction = manualComment
    ? `The teacher has written a draft comment: "${manualComment}". Please refine and enhance this comment. Keep the original sentiment but improve the wording to be more eloquent, positive, and constructive for the student's guardian. Integrate some of the provided data points naturally if it strengthens the comment.`
    : `Based on the data, please write a brief, positive, and constructive comment for the student's guardian.
    Instructions:
    1. Start with a warm greeting addressing the parent/guardian.
    2. Highlight the student's strengths and recent accomplishments in both reading and memorization.
    3. Mention their consistency or effort based on attendance.
    4. If there are areas for improvement (e.g., lower quality scores, absences), frame it constructively and gently.
    5. Keep the tone positive and motivating.
    6. Conclude with an encouraging closing statement.
    
    Do not just list the stats. Weave them into a natural, paragraph-form comment.`;

  const prompt = `${basePrompt}\n\n${instruction}`;


  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    return response.text.trim();
  } catch (error) {
    console.error("Error generating comment with Gemini API:", error);
    return "There was an error generating the AI comment. Please check the console for details.";
  }
};
