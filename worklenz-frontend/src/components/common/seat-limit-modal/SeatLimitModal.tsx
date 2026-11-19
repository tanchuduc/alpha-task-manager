import React from 'react';

interface SeatLimitModalProps {
  open?: boolean;
  onClose?: () => void;
  currentMembers?: number;
  planLimit?: number;
  businessLimit?: number;
  isAppSumoUser?: boolean;
  onUpgrade?: () => void;
  onDeactivate?: () => void;
}

export const SeatLimitModal: React.FC<SeatLimitModalProps> = () => {
  // Seat limits are disabled for Alpha Work internal edition
  return null;
};

export default SeatLimitModal;
