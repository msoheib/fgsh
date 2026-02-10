@echo off
echo Running TypeScript check...
call npx tsc --noEmit
if %errorlevel% neq 0 (
    echo ❌ TypeScript check failed!
    exit /b %errorlevel%
)
echo ✅ TypeScript check passed.
echo Pushing to git...
git add .
git commit -m "chore: typescript check passed"
git push origin main
echo 🎉 Done!
