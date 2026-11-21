import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Language } from "@team1/shared";

// Keys missing from `om` / `am` fall back to English. Copy that describes features the pilot does not
// have yet (advance payments, AI matching) was removed; add translations once native speakers review them.
const en = {
  brandSub: "Jimma Flexible Work & Local Services",
  navFindJobs: "Explore Jobs",
  navHowItWorks: "How It Works",
  navMyActivity: "Activity & Progression",
  navAdmin: "Admin Console",
  navSignIn: "Sign in",
  navProfile: "My profile",
  navSignOut: "Sign out",
  navNotifications: "Notifications",
  workerMode: "Worker Mode",
  employerMode: "Employer Mode",
  heroBadge: "Jimma, Ethiopia • Local Pilot Marketplace",
  heroTitle1: "Get Hired Faster",
  heroTitle2: "& Smarter in Jimma.",
  heroSubtitle:
    "Connect with trusted Jimma households, shops, and businesses for hourly, daily, or task-based work—with 3-tier trust checks, private contact details, and reviews on every completed job.",
  searchLabel: "Search",
  searchPlaceholder: "Skill or job (e.g. Tutor, Plumber, Shop help)...",
  locationLabel: "Jimma Location",
  locationAll: "All Jimma Landmarks",
  searchBtn: "Search",
  statWorkers: "Registered Members",
  statEmployers: "Households & Shops Hiring",
  statOpenJobs: "Open Jobs",
  statTiers: "3-Level Trust Safeguards",
  howTitle: "How It Works",
  howSubtitle: "Built for privacy, safety, and local accountability in Jimma.",
  step1Title: "Create Username-Only Account",
  step1Desc:
    "Public usernames (@handle) protect your real name and phone number while letting you act as both Worker & Employer.",
  step2Title: "3-Tier Risk & Skill Verification",
  step2Desc:
    "Start in Tier 3 (Ordinary), add matching skills for Tier 2 (Skilled), or request Tier 1 VIP (Childcare & Household Access) with identity verification and safety-team approval.",
  step3Title: "Find Nearby Work & Get Selected",
  step3Desc:
    "Filter by Jimma neighbourhood, category, and pay. Employers compare applicants by username, skills, and reviews — phone numbers stay hidden.",
  step4Title: "Confirm, Unlock Contacts & Rate",
  step4Desc:
    "When the worker accepts the employer's selection, both sides see each other's phone number. After the job, both confirm completion and leave a review.",
  catTitle: "Find Jobs by",
  catTitleBold: "Category",
  catSubtitle: "Every category maps to our 3-Level Trust Tier architecture.",
  viewJobs: "View jobs",
  openJobs: "open jobs",
  exploreTitle: "Explore",
  exploreTitleBold: "Jobs",
  exploreSubtitle: "Browse open opportunities across Jimma neighborhoods.",
  latestJobs: "Latest jobs",
  seeAllJobs: "See all jobs",
  filterTitle: "Filter by Tier & Terms",
  filterTier: "3-Level Trust Tier",
  filterPay: "Payment Schedule",
  filterCategory: "Category",
  filterEligible: "Only jobs I can apply for",
  filterAllTiers: "All 3 Trust Tiers",
  filterAllPay: "All Payment Terms",
  filterAllCategories: "All categories",
  applyNow: "Apply / Pitch",
  applied: "Applied",
  privacyTitle: "Username & Contact Privacy",
  privacyNote: "Usernames only. Phone numbers stay hidden until the worker confirms the pairing.",
  postJobBtn: "Post a New Job",
  employerDashTitle: "Employer Workspace",
  employerDashSub: "Review applicants, select a worker, track pairings, and rebook people you trust.",
  applicantsTitle: "Applicants & Pairings",
  myJobsTitle: "My job posts",
  rebookTitle: "Completed Pairings & 1-Click Re-Book",
  rebookBtn: "Re-Book Worker",
  workerDashTitle: "Reputation Progression",
  myApplications: "My applications",
  myPairings: "My jobs in progress",
  rebookRequests: "Rebooking requests",
  noJobs: "No jobs match these filters yet.",
  footerNote: "Hojii Jimmaa / የጅማ ሥራ — Jimma Pilot Marketplace • Privacy & Safeguarding First",
};

type Key = keyof typeof en;

const om: Partial<Record<Key, string>> = {
  brandSub: "Gabaa Hojii Naannoo Jimmaa",
  navFindJobs: "Hojii Barbaadi",
  navHowItWorks: "Akkamitti Hojjeta",
  navMyActivity: "Sochii & Sadarkaa",
  navAdmin: "Bulchiinsa Admin",
  workerMode: "Haala Hojjetaa",
  employerMode: "Haala Hojjechiisaa",
  heroBadge: "Jimma, Itoophiyaa • Gabaa Mirkanaa’aa",
  heroTitle1: "Jimmatti Dafii",
  heroTitle2: "Hojii Argadhu.",
  heroSubtitle:
    "Maatii, suuqii fi dhaabbilee Jimmaa waliin hojii sa’aatii, guyyaa ykn pirojektii argadhu—sadarkaa amanamummaa 3n.",
  searchPlaceholder: "Dandeettii ykn hojii (fkn. Barsiisaa, Suphaa)...",
  locationAll: "Naannoo Jimmaa Hundaa",
  searchBtn: "Barbaadi",
  statEmployers: "Maatii & Suuqiiwwan",
  statTiers: "Sadarkaa Nageenyaa 3",
  howTitle: "Akkamitti Hojjeta",
  step1Title: "Maqaa Fayyadamaa (@Username) Banadhu",
  step1Desc:
    "Maqaan dhugaa fi Fayda ID keessan iccitiin eegama; akkaawuntii tokkoon hojjetaa fi hojjechiisaa ta’uu dandeessu.",
  step2Title: "Sadarkaa Amanamummaa 3",
  step2Desc:
    "Sadarkaa 3 (Idilee) jalqabi, Sadarkaa 2 (Ogummaa) muuxannoo barreessi, Sadarkaa 1 VIP (Daa’imman & Manaa) ID mirkaneessi.",
  catTitle: "Gosa Hojiitiin",
  catTitleBold: "Barbaadi",
  catSubtitle: "Gosni hojii hundi sadarkaa amanamummaa 3 keessaa tokko qaba.",
  viewJobs: "Hojii ilaali",
  exploreTitle: "Hojiiwwan",
  exploreTitleBold: "Jiran",
  exploreSubtitle: "Carraa hojii mirkanaa’aa magaalattii keessaa sakatta’i.",
  filterAllTiers: "Sadarkaa 3 Hundaa",
  filterAllPay: "Haala Kaffaltii Hundaa",
  applyNow: "Iyyadhu / Muuxannoo",
  applied: "Iyyatameera",
  postJobBtn: "Hojii Haaraa Maxxansi",
  employerDashTitle: "Bakka Hojii Hojjechiisaa",
  rebookTitle: "Hojiiwwan Xumuraman & Irra Deebiin Qacaruu",
  rebookBtn: "Irra Deebiin Qacari",
  footerNote: "Hojii Jimmaa / የጅማ ሥራ — Gabaa Pilootii Jimmaa",
};

const am: Partial<Record<Key, string>> = {
  brandSub: "የጅማ ጊዜያዊ ሥራ እና አገልግሎት ገበያ",
  navFindJobs: "ሥራዎችን ያስሱ",
  navHowItWorks: "እንዴት ይሰራል",
  navMyActivity: "እንቅስቃሴ እና እድገት",
  navAdmin: "የአስተዳዳሪ (Admin) ገጽ",
  workerMode: "የሠራተኛ ገጽ",
  employerMode: "የአሠሪ ገጽ",
  heroBadge: "ጅማ፣ ኢትዮጵያ • የተረጋገጠ የአካባቢ ገበያ",
  heroTitle1: "ጅማ ውስጥ በፍጥነት",
  heroTitle2: "እና በብልሃት ሥራ ያግኙ።",
  heroSubtitle: "በጅማ ከተማ ከሚገኙ ታማኝ ቤተሰቦች፣ ሱቆች እና ድርጅቶች ጋር ይገናኙ—በ3 ደረጃ ማረጋገጫ።",
  searchPlaceholder: "ክህሎት ወይም ሥራ (ምሳሌ፡ አስጠኚ፣ ቧንቧ)...",
  locationAll: "ሁሉም የጅማ ሰፈሮች",
  searchBtn: "ፈልግ",
  statEmployers: "ንቁ ቤተሰቦች እና ሱቆች",
  statTiers: "ባለ 3-ደረጃ የእምነት ጥበቃ",
  howTitle: "እንዴት ይሰራል",
  step1Title: "በመለያ ስም (@Username) ይመዝገቡ",
  step1Desc: "ትክክለኛ ስምዎ እና የብሔራዊ ፋይዳ መታወቂያዎ በሚስጥር ይያዛል፤ በአንድ መለያ ሠራተኛም አሠሪም መሆን ይችላሉ።",
  step2Title: "ባለ 3-ደረጃ የብቃት እና እምነት ማረጋገጫ",
  step2Desc:
    "በደረጃ 3 (መደበኛ) ይጀምሩ፣ ለደረጃ 2 (ሙያዊ) ልምድዎን ይጻፉ፣ ለደረጃ 1 VIP (የልጆች እና ቤት ውስጥ) ብሔራዊ መታወቂያ ያረጋግጡ።",
  catTitle: "ሥራዎችን በዘርፍ",
  catTitleBold: "ይፈልጉ",
  catSubtitle: "እያንዳንዱ ዘርፍ በ3-ደረጃ የእምነት መዋቅር የተደራጀ ነው።",
  viewJobs: "ሥራዎችን ይመልከቱ",
  exploreTitle: "ያሉ",
  exploreTitleBold: "ሥራዎች",
  exploreSubtitle: "በመላው ጅማ የተረጋገጡ የሥራ ዕድሎችን ያስሱ።",
  filterAllTiers: "ሁሉም 3 የእምነት ደረጃዎች",
  filterAllPay: "ሁሉም የክፍያ ውሎች",
  applyNow: "ያመልክቱ / ልምድ ይጻፉ",
  applied: "አመልክተዋል",
  postJobBtn: "አዲስ ሥራ ይለጥፉ",
  employerDashTitle: "የአሠሪ መቆጣጠሪያ ገጽ",
  rebookTitle: "የተጠናቀቁ ሥራዎች እና በ1-ጠቅታ ድጋሚ ቅጥር",
  rebookBtn: "ሠራተኛውን ድጋሚ ይቅጠሩ",
  footerNote: "Hojii Jimmaa / የጅማ ሥራ — የጅማ ሙከራ ፕሮጀክት",
};

const dictionaries: Record<Language, Partial<Record<Key, string>>> = { en, om, am };
const STORAGE_KEY = "hj.lang";

type I18n = { lang: Language; setLang: (lang: Language) => void; t: (key: Key) => string };
const I18nContext = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === "om" || saved === "am" ? saved : "en";
  });

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((next: Language) => {
    localStorage.setItem(STORAGE_KEY, next);
    setLangState(next);
  }, []);

  const value = useMemo<I18n>(
    () => ({ lang, setLang, t: (key) => dictionaries[lang][key] ?? en[key] }),
    [lang, setLang],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside I18nProvider");
  return ctx;
}
