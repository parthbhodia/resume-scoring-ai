import { useEffect } from "react";
import { useProfilePageStore, type DashboardStats, type Activity } from "@/store/profilePageStore";
import { apiUrl } from "@/lib/utils";

interface ProfileDashboardResponse {
  stats: DashboardStats;
  activity: Activity[];
}

/**
 * Fetch and manage profile dashboard data (KPIs, recent activity, etc.)
 * Syncs to Zustand store for reactive updates
 */
export function useProfileDashboard() {
  const store = useProfilePageStore();

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        store.setStatsLoading(true);
        store.setStatsError(null);

        const resp = await fetch(apiUrl("/api/profile-dashboard"));

        if (!resp.ok) {
          if (resp.status === 401) {
            throw new Error("Unauthorized - please sign in");
          }
          throw new Error(`HTTP ${resp.status}`);
        }

        const data = (await resp.json()) as ProfileDashboardResponse;
        store.setStats(data.stats);
        store.setActivity(data.activity);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to load dashboard";
        store.setStatsError(message);
        console.error("Profile dashboard fetch error:", error);
      } finally {
        store.setStatsLoading(false);
      }
    };

    fetchDashboardData();
  }, [store]);

  return {
    stats: store.stats,
    activity: store.activity,
    loading: store.statsLoading,
    error: store.statsError,
  };
}
