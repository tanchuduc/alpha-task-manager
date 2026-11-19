import { useState, useEffect } from 'react';
import { surveyApiService } from '@/api/survey/survey.api.service';
import logger from '@/utils/errorLogger';

export interface UseSurveyStatusResult {
  hasCompletedSurvey: boolean | null;
  isNewUser: boolean;
  joinedViaInvitation: boolean;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export const useSurveyStatus = (): UseSurveyStatusResult => {
  return {
    hasCompletedSurvey: true,
    isNewUser: false,
    joinedViaInvitation: false,
    loading: false,
    error: null,
    refetch: async () => {},
  };
};
