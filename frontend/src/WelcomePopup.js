import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';

const WelcomePopup = () => {
  const [showPopup, setShowPopup] = useState(false);

  useEffect(() => {
    // Check if user has seen the popup before
    const hasSeenPopup = localStorage.getItem('hasSeenWelcomePopup');
    if (!hasSeenPopup) {
      setShowPopup(true);
    }
  }, []);

  const handleClose = () => {
    setShowPopup(false);
    // Mark as seen so it doesn't show again
    localStorage.setItem('hasSeenWelcomePopup', 'true');
  };

  if (!showPopup) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 border border-gray-700 rounded-lg max-w-lg w-full p-6 relative shadow-2xl">
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
        >
          <X className="w-6 h-6" />
        </button>
        
        <h2 className="text-2xl font-bold text-white mb-6">
          Welcome to Track That Bat!
        </h2>
        
        <div className="text-gray-300 space-y-4 mb-6 max-h-96 overflow-y-auto">
          <p>
            Like many of you, I'm a baseball & softball dad and coach. I built this to solve my own problem: finding the best bat prices without jumping between countless websites.
          </p>
          
          <p>
            Halfway through building it, I realized other parents, coaches and players face the same frustration.
          </p>
          
          <p>
            This is a work in progress that improves daily. If you hit a bug, please be patient as I clean things up, add features and additional retailers. It's a passion project that I hope helps the baseball & softball community by saving everyone time and money looking for your next bat.
          </p>
          
          <div className="bg-gray-900 p-4 rounded-lg border border-gray-600">
            <p className="font-semibold text-blue-400 mb-2">What's live:</p> 
            <p className="text-sm">Specific pricing for BBCOR (by length) & USSSA (by length & drop) across 2 major retailers</p>
            
            <p className="font-semibold text-green-400 mt-3 mb-2">Coming soon:</p> 
            <p className="text-sm">Fastpitch bats, more retailers, and enhanced features</p>
          </div>
          
          <p>
            Ran into an issue? Have suggestions? Want to request a missing bat? Please feel free to reach out{' '}
            <a href="mailto:info@trackthatbat.com" className="text-blue-400 hover:text-blue-300 underline">
              info@trackthatbat.com
            </a>.
          </p>
          
          <p className="font-medium text-white pt-2">
            Thanks for checking it out!
          </p>
        </div>
        
        <button
          onClick={handleClose}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
        >
          Get Started
        </button>
      </div>
    </div>
  );
};

export default WelcomePopup;