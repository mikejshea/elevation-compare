terraform {
  backend "gcs" {
    bucket = "elevation-compare-tfstate"
    prefix = "terraform/state"
  }
}
