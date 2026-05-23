terraform {
  required_version = ">= 1.6"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

# ── Required APIs ──────────────────────────────────────────────────────────────

resource "google_project_service" "run" {
  service            = "run.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "artifactregistry" {
  service            = "artifactregistry.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "iam" {
  service            = "iam.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "iamcredentials" {
  service            = "iamcredentials.googleapis.com"
  disable_on_destroy = false
}

# ── Artifact Registry ──────────────────────────────────────────────────────────

resource "google_artifact_registry_repository" "app" {
  repository_id = "elevation-compare"
  format        = "DOCKER"
  location      = var.region

  depends_on = [google_project_service.artifactregistry]
}

# ── Cloud Run ──────────────────────────────────────────────────────────────────

# Dedicated runtime service account — app makes no GCP API calls,
# so this just avoids using the broad Compute default SA.
resource "google_service_account" "cloud_run" {
  account_id   = "elevation-compare-run"
  display_name = "Cloud Run runtime — elevation-compare"

  depends_on = [google_project_service.iam]
}

resource "google_cloud_run_v2_service" "app" {
  name     = "elevation-compare"
  location = var.region

  template {
    service_account = google_service_account.cloud_run.email

    scaling {
      min_instance_count = 0
      max_instance_count = 3
    }

    containers {
      # Placeholder on first apply; GitHub Actions manages image updates.
      image = "us-docker.pkg.dev/cloudrun/container/hello"

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
        cpu_idle = true
      }
    }
  }

  # Terraform provisions the service; CI/CD owns the deployed image.
  lifecycle {
    ignore_changes = [template[0].containers[0].image]
  }

  depends_on = [google_project_service.run]
}

# Allow public (unauthenticated) access.
resource "google_cloud_run_v2_service_iam_member" "public" {
  name     = google_cloud_run_v2_service.app.name
  location = google_cloud_run_v2_service.app.location
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# ── GitHub Actions service account ────────────────────────────────────────────

resource "google_service_account" "github_actions" {
  account_id   = "github-actions"
  display_name = "GitHub Actions — elevation-compare CI/CD"

  depends_on = [google_project_service.iam]
}

# Deploy Cloud Run services.
resource "google_project_iam_member" "github_actions_run_admin" {
  project = var.project_id
  role    = "roles/run.admin"
  member  = "serviceAccount:${google_service_account.github_actions.email}"
}

# Push images to the repository.
resource "google_artifact_registry_repository_iam_member" "github_actions_ar_writer" {
  repository = google_artifact_registry_repository.app.repository_id
  location   = var.region
  role       = "roles/artifactregistry.writer"
  member     = "serviceAccount:${google_service_account.github_actions.email}"
}

# Required to deploy a Cloud Run service that runs as a specific SA.
resource "google_service_account_iam_member" "github_actions_act_as_run" {
  service_account_id = google_service_account.cloud_run.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.github_actions.email}"
}

# ── Workload Identity Federation ──────────────────────────────────────────────

data "google_project" "project" {}

resource "google_iam_workload_identity_pool" "github" {
  workload_identity_pool_id = "elevation-compare-github"
  display_name              = "GitHub Actions"

  depends_on = [google_project_service.iam]
}

resource "google_iam_workload_identity_pool_provider" "github" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github-provider"
  display_name                       = "GitHub"

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }

  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.repository" = "assertion.repository"
  }

  # Only tokens from this specific repo can impersonate the GHA service account.
  attribute_condition = "assertion.repository == '${var.github_repo}'"
}

resource "google_service_account_iam_member" "github_wif_binding" {
  service_account_id = google_service_account.github_actions.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/${var.github_repo}"
}
