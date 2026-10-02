# Proposed matched release: v1.0.0-rc.1

Status: publication candidate; release tags and archiving remain to be completed. No GitHub release, Zenodo record or DOI has been created. Package versions describe this candidate and do not prove which code was deployed for the original experiments.

## Included changes

- Original license status is retained pending a rights-holder decision.
- Candidate version and CITATION.cff in both repositories.
- Clear README setup and limits, frontend HTML correction.
- Backend `reproducibility/` scripts, pinned Python requirements, seven meaningful test cases, public catalogue snapshot and measured transfer outputs.
- `MANUSCRIPT_ALIGNMENT.md` with claims requiring correction before final publication.

Original implementation is credited to Diyorbek Olimov. An explicit open-source license requires agreement by the software rights holders. Data and third-party assets require separate reuse terms.

## Publish the candidate

Use the included frontend/backend patches on the baseline commits, or use the prepared source trees in the bundle. Review the staged changes and adopt the intended license. In each repository, after the changes have been committed and the checks have passed:

```bash
git tag -a v1.0.0-rc.1 -m "Sam-Landshaft paper release candidate"
git push origin main
git push origin v1.0.0-rc.1
```

Run these from a branch authorized for the target repository; use a reviewed pull request if the branch is protected. The commands are instructions for the repository owner and were not executed against GitHub during preparation.

Create a GitHub release for each tag, mark it as a prerelease, use the text in `RELEASE_NOTES.md`, and attach source snapshots/checksums and the research outputs where appropriate. Before a final `v1.0.0`, reconcile the manuscript, freeze the datasets, and verify the same-pixel comparison and full deployment. A version number alone does not establish reproducibility.

## Obtain a DOI

Enable the chosen repositories in the owner's Zenodo account, then publish the intended GitHub release for archiving. Check the resulting Zenodo records and use the version-specific DOI for the release corresponding to the paper; add it to CITATION.cff and the manuscript only after it exists. Archive rasters in a data repository separately and cite its identifier and reuse terms. See https://docs.github.com/en/repositories/archiving-a-github-repository/referencing-and-citing-content and https://help.zenodo.org/docs/github/.

## Citation metadata

CITATION.cff credits the original implementation author identified by the source Git history. The owners can replace it with the agreed contributor list and identifiers before publication. Do not fill in missing affiliations, contributor roles, DOI or publication date by guessing.
