export enum UserRole {
  GUEST = 'guest',
  FREE = 'free',
  PRO = 'pro',
}

export const rolePriority: Record<UserRole, number> = {
  [UserRole.GUEST]: 0,
  [UserRole.FREE]: 1,
  [UserRole.PRO]: 2,
};
