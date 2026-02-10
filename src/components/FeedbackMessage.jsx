import React from 'react';

/**
 * Feedback message component - displays success or completion messages
 * @param {Object} feedback - Feedback object with type and message
 */
export default function FeedbackMessage({ feedback }) {
  if (!feedback) return null;
  
  return (
    <div className={`mb-6 rounded-lg p-4 border-l-4 ${
      feedback.type === 'complete'
        ? 'bg-green-900 border-green-500 text-green-100'
        : 'bg-blue-900 border-blue-500 text-blue-100'
    }`}>
      <p className="font-bold">{feedback.message}</p>
    </div>
  );
}