import { Suspense } from "react";
import { PractiseChartView } from "@/components/views/ChartView";
export const metadata = { title: "Practise · Gig Book" };
export default function Page() { return <Suspense><PractiseChartView /></Suspense>; }
