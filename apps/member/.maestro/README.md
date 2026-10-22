# Maestro flows for the member app

The same journeys as `e2e/member.spec.ts`, on a real iPhone or Android build. They need a build of
the app (an EAS development or preview build, app id `com.getintu.member`) pointed at staging, and a
TEST member whose phone number is set as a Supabase test number with a fixed code.

```sh
maestro test .maestro -e PHONE="+999 1234567890" -e CODE=123456
```

`PHONE` must belong to a TEST member with an active pass and a photo. Flows run in name order.
