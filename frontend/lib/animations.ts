export const uploadStage = {
  idle: { x: 0, scale: 1, opacity: 1 },
  toSide: { x: "-18%", scale: 0.88, opacity: 0.95, transition: { duration: 0.55, ease: [0.16,1,0.3,1] }},
};
export const panelStage = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.16,1,0.3,1] }},
};
