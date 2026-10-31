import ResumeApp from "@/components/ResumeApp";
import { isAffindaKeyWorking } from "@/lib/affindaKey";

// Read per request: the key is a deploy-time setting that can also expire, so
// a prerendered page would freeze whatever it was at build. Only the boolean
// goes to the browser, never the key.
export const dynamic = "force-dynamic";

export default async function Home() {
  const liveParsing = await isAffindaKeyWorking(process.env.AFFINDA_API_KEY);
  return <ResumeApp liveParsing={liveParsing} />;
}
