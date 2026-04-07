export type MembershipTier = "free" | "pro";
export type AuthRole = "guest" | MembershipTier;

interface StoredUser {
  id: string;
  nickname: string;
  password: string;
  tier: MembershipTier;
}

interface AuthSnapshot {
  role: AuthRole;
  isLoggedIn: boolean;
  isPro: boolean;
  userName: string;
}

interface AuthResult {
  ok: boolean;
  message?: string;
}

const USERS_KEY = "aipot_users";
const ROLE_KEY = "aipot_role";
const AUTH_KEY = "aipot_auth";
const USERNAME_KEY = "aipot_user_name";

const seedUsers: StoredUser[] = [
  { id: "seed-free", nickname: "free_user", password: "free1234", tier: "free" },
  { id: "seed-pro", nickname: "pro_user", password: "pro1234", tier: "pro" },
];

function canUseStorage() {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function readUsers(): StoredUser[] {
  if (!canUseStorage()) return [];

  try {
    const raw = localStorage.getItem(USERS_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as StoredUser[];
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

function writeUsers(users: StoredUser[]) {
  if (!canUseStorage()) return;
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function normalizeName(name: string) {
  return name.trim().toLowerCase();
}

function setSession(role: AuthRole, userName: string) {
  if (!canUseStorage()) return;

  localStorage.setItem(ROLE_KEY, role);
  localStorage.setItem(AUTH_KEY, role === "guest" ? "guest" : "user");
  localStorage.setItem(USERNAME_KEY, userName);
}

export function ensureAuthSeedData() {
  if (!canUseStorage()) return;

  const users = readUsers();
  if (users.length === 0) {
    writeUsers(seedUsers);
  }
}

export function signInUser(nickname: string, password: string): AuthResult {
  ensureAuthSeedData();

  const users = readUsers();
  const lookup = normalizeName(nickname);
  const user = users.find((item) => normalizeName(item.nickname) === lookup);

  if (!user || user.password !== password) {
    return { ok: false, message: "아이디 또는 비밀번호가 올바르지 않습니다." };
  }

  setSession(user.tier, user.nickname);
  return { ok: true };
}

export function signUpUser(nickname: string, password: string): AuthResult {
  ensureAuthSeedData();

  const users = readUsers();
  const trimmed = nickname.trim();
  const lookup = normalizeName(trimmed);
  const exists = users.some((item) => normalizeName(item.nickname) === lookup);

  if (exists) {
    return { ok: false, message: "이미 사용 중인 닉네임입니다." };
  }

  const newUser: StoredUser = {
    id: `user-${Date.now()}`,
    nickname: trimmed,
    password,
    tier: "free",
  };

  writeUsers([...users, newUser]);
  return { ok: true };
}

export function signInGuest() {
  setSession("guest", "Guest");
}

export function signOut() {
  if (!canUseStorage()) return;

  localStorage.removeItem(ROLE_KEY);
  localStorage.removeItem(AUTH_KEY);
  localStorage.removeItem(USERNAME_KEY);
}

export function getCurrentAuth(): AuthSnapshot {
  if (!canUseStorage()) {
    return { role: "guest", isLoggedIn: false, isPro: false, userName: "Guest" };
  }

  const roleRaw = localStorage.getItem(ROLE_KEY);
  const role: AuthRole = roleRaw === "free" || roleRaw === "pro" ? roleRaw : "guest";
  const userName = role === "guest" ? "Guest" : localStorage.getItem(USERNAME_KEY) || "Player";

  return {
    role,
    isLoggedIn: role !== "guest",
    isPro: role === "pro",
    userName,
  };
}
