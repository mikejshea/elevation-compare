output "cloud_run_url" {
  description = "Public URL of the Cloud Run service"
  value       = google_cloud_run_v2_service.app.uri
}

output "image_base" {
  description = "Artifact Registry image base (append :tag to deploy)"
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/elevation-compare/server"
}

# Copy these two values into GitHub repository secrets:
#   WIF_PROVIDER       → workload_identity_provider
#   WIF_SERVICE_ACCOUNT → github_actions_service_account

output "workload_identity_provider" {
  description = "Workload Identity Provider resource name — set as GitHub secret WIF_PROVIDER"
  value       = google_iam_workload_identity_pool_provider.github.name
}

output "github_actions_service_account" {
  description = "GitHub Actions service account email — set as GitHub secret WIF_SERVICE_ACCOUNT"
  value       = google_service_account.github_actions.email
}
